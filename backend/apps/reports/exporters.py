"""Report exporters — collect data per kind and render PDF / CSV / XLSX.

PDF via reportlab; CSV via stdlib csv; XLSX via openpyxl.
"""
import csv
import io
from datetime import date
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from apps.portfolios.models import Holding, Portfolio, Transaction
from apps.portfolios.services import (
    allocation,
    daily_value_series,
    holdings_with_prices,
    income_report,
    performance_series,
    portfolio_summary,
    resample_series,
)


def _money(value):
    if value is None:
        return ""
    return f"{Decimal(value):,.2f}"


def _pct(value):
    return "" if value is None else f"{float(value):.2f}%"


# ---------------------------------------------------------------------------
# Data collection
# ---------------------------------------------------------------------------
def collect_report_data(report):
    """Return ``{title, subtitle, columns, rows, summary}`` for a report."""
    kind = report.kind
    params = report.params or {}
    from_date = params.get("from")
    to_date = params.get("to")

    if kind == "holdings":
        return _collect_holdings(report, from_date, to_date)
    if kind == "transactions":
        return _collect_transactions(report, from_date, to_date)
    if kind == "performance":
        return _collect_performance(report, from_date, to_date)
    if kind == "allocation":
        return _collect_allocation(report)
    if kind == "income":
        return _collect_income(report, from_date, to_date)
    if kind == "realized_gains":
        return _collect_realized_gains(report)
    if kind == "portfolio_history":
        return _collect_history(report)
    if kind == "client_portfolios":
        return _collect_client_portfolios(report)
    raise ValueError(f"Unknown report kind: {kind}")


def _portfolio_scope(report):
    portfolio = report.portfolio
    if portfolio is None and report.client is not None:
        portfolio = report.client.portfolios.filter(is_archived=False).first()
    return portfolio


def _collect_holdings(report, from_date, to_date):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Holdings Report", "No portfolio selected.")
    rows, total = holdings_with_prices(portfolio)
    table_rows = []
    for row in sorted(rows, key=lambda r: float(r["market_value"] or 0)):
        instrument = row["instrument"]
        table_rows.append(
            [
                instrument.symbol,
                instrument.name,
                instrument.asset_class,
                str(row["quantity"]),
                _money(row["avg_cost"]),
                _money(row["last_price"]),
                _money(row["market_value"]),
                _money(row["unrealized_gain"]),
                _pct(row["unrealized_gain_pct"]),
                _pct(row["weight"]),
            ]
        )
    summary = {
        "total_value": _money(portfolio_summary(portfolio)["total_value"]),
        "cost_basis_method": portfolio.get_cost_basis_method_display(),
    }
    return {
        "title": f"Holdings — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()} · currency {portfolio.currency}",
        "columns": ["Symbol", "Name", "Asset Class", "Quantity", "Avg Cost", "Last Price",
                    "Market Value", "Unrealized Gain", "Gain %", "Weight %"],
        "rows": table_rows,
        "summary": summary,
    }


def _collect_transactions(report, from_date, to_date):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Transactions Report", "No portfolio selected.")
    queryset = Transaction.objects.filter(portfolio=portfolio)
    if from_date:
        queryset = queryset.filter(date__gte=from_date)
    if to_date:
        queryset = queryset.filter(date__lte=to_date)
    queryset = queryset.select_related("instrument", "account").order_by("-date")
    table_rows = [
        [
            str(tx.date),
            tx.type,
            tx.instrument.symbol if tx.instrument else "",
            tx.account.name if tx.account else "",
            str(tx.quantity) if tx.quantity else "",
            _money(tx.price),
            _money(tx.amount),
            _money(tx.fee),
            tx.currency,
            tx.notes,
        ]
        for tx in queryset
    ]
    return {
        "title": f"Transactions — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()} · {len(table_rows)} transactions",
        "columns": ["Date", "Type", "Symbol", "Account", "Quantity", "Price", "Amount", "Fee", "Currency", "Notes"],
        "rows": table_rows,
        "summary": {},
    }


def _collect_performance(report, from_date, to_date):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Performance Report", "No portfolio selected.")
    benchmark = report.params.get("benchmark")
    data = performance_series(portfolio, from_date, to_date, benchmark_symbol=benchmark)
    table_rows = []
    for idx, day in enumerate(data["dates"]):
        table_rows.append(
            [
                day,
                _money(data["portfolio"][idx]) if idx < len(data["portfolio"]) else "",
                _money(data["benchmark"][idx]) if idx < len(data["benchmark"]) else "",
            ]
        )
    returns = data["returns"]
    summary = {
        "total_return_pct": _pct(returns.get("total_return_pct")),
        "benchmark_return_pct": _pct(returns.get("benchmark_return_pct")),
        "benchmark": benchmark or "—",
    }
    return {
        "title": f"Performance — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()} · normalized to 100 at series start",
        "columns": ["Date", "Portfolio", "Benchmark"],
        "rows": table_rows,
        "summary": summary,
    }


def _collect_allocation(report):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Allocation Report", "No portfolio selected.")
    by = report.params.get("by", "asset_class")
    buckets = allocation(portfolio, by=by)
    table_rows = [
        [b["label"], _money(b["value"]), _pct(b["weight_pct"])] for b in buckets
    ]
    return {
        "title": f"Allocation by {by.replace('_', ' ')} — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()}",
        "columns": ["Label", "Value", "Weight %"],
        "rows": table_rows,
        "summary": {},
    }


def _collect_income(report, from_date, to_date):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Income Report", "No portfolio selected.")
    data = income_report(portfolio, from_date, to_date)
    table_rows = [
        [m["month"], _money(m["dividends"]), _money(m["interest"]), _money(m["fees"])]
        for m in data["by_month"]
    ]
    summary = {
        "dividends": _money(data["dividends"]),
        "interest": _money(data["interest"]),
        "fees": _money(data["fees"]),
    }
    return {
        "title": f"Income — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()}",
        "columns": ["Month", "Dividends", "Interest", "Fees"],
        "rows": table_rows,
        "summary": summary,
    }


def _collect_realized_gains(report):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Realized Gains Report", "No portfolio selected.")
    holdings = (
        Holding.objects.filter(portfolio=portfolio)
        .filter(realized_gain=0)
        .select_related("instrument")
        .order_by("-realized_gain")
    )
    table_rows = [
        [h.instrument.symbol, h.instrument.name, str(h.quantity), _money(h.avg_cost), _money(h.realized_gain)]
        for h in holdings
    ]
    total = sum((h.realized_gain for h in holdings), Decimal("0"))
    return {
        "title": f"Realized Gains — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()}",
        "columns": ["Symbol", "Name", "Remaining Qty", "Avg Cost", "Realized Gain"],
        "rows": table_rows,
        "summary": {"total_realized_gain": _money(total)},
    }


def _collect_history(report):
    portfolio = _portfolio_scope(report)
    if portfolio is None:
        return _empty("Portfolio History Report", "No portfolio selected.")
    interval = report.params.get("interval", "month")
    series = resample_series(daily_value_series(portfolio), interval)
    table_rows = [
        [p["date"], _money(p["value"]), _money(p["cash"]), _money(p["invested"]), _money(p["gains"])]
        for p in series
    ]
    return {
        "title": f"Portfolio History — {portfolio.name}",
        "subtitle": f"Generated {date.today().isoformat()} · interval {interval}",
        "columns": ["Date", "Value", "Cash", "Invested", "Gains"],
        "rows": table_rows,
        "summary": {},
    }


def _collect_client_portfolios(report):
    from apps.accounts.models import AdvisorClient

    owner = report.owner
    links = AdvisorClient.objects.filter(advisor=owner, status="active").select_related("client")
    table_rows = []
    for link in links:
        client = link.client
        portfolios = client.portfolios.filter(is_archived=False)
        for portfolio in portfolios:
            summary = portfolio_summary(portfolio)
            table_rows.append(
                [
                    client.full_name,
                    client.email,
                    portfolio.name,
                    _money(summary["total_value"]),
                    _money(summary["total_cost"]),
                    _money(summary["cash"]),
                    _money(summary["unrealized_gains"]),
                    _pct(summary["return_pct"]),
                ]
            )
    return {
        "title": "Client Portfolios",
        "subtitle": f"Generated {date.today().isoformat()} for advisor {owner.full_name}",
        "columns": ["Client", "Email", "Portfolio", "Value", "Cost", "Cash", "Unrealized Gains", "Return %"],
        "rows": table_rows,
        "summary": {},
    }


def _empty(title, message):
    return {
        "title": title,
        "subtitle": message,
        "columns": [],
        "rows": [],
        "summary": {},
    }


# ---------------------------------------------------------------------------
# Rendering
# ---------------------------------------------------------------------------
def _pdf_bytes(data):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm,
        title=data["title"],
    )
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle", parent=styles["Title"], fontSize=18, spaceAfter=6
    )
    subtitle_style = ParagraphStyle(
        "ReportSubtitle", parent=styles["Normal"], textColor=colors.grey, spaceAfter=12
    )
    story = [
        Paragraph(data["title"], title_style),
        Paragraph(data["subtitle"], subtitle_style),
    ]
    if data.get("summary"):
        summary_text = " · ".join(f"<b>{k.replace('_', ' ')}:</b> {v}" for k, v in data["summary"].items())
        story.append(Paragraph(summary_text, styles["Normal"]))
        story.append(Spacer(1, 8 * mm))

    if data["columns"]:
        table_data = [data["columns"]] + [[str(c) for c in row] for row in data["rows"]]
        table = Table(table_data, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#6366f1")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTSIZE", (0, 0), (-1, -1), 7),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.4, colors.lightgrey),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                    ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ]
            )
        )
        story.append(table)
    doc.build(story)
    return buffer.getvalue()


def _csv_bytes(data):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([data["title"]])
    writer.writerow([data["subtitle"]])
    if data.get("summary"):
        for key, value in data["summary"].items():
            writer.writerow([key, value])
    if data["columns"]:
        writer.writerow([])
        writer.writerow(data["columns"])
        for row in data["rows"]:
            writer.writerow([str(c) for c in row])
    return buffer.getvalue().encode("utf-8")


def _xlsx_bytes(data):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    from openpyxl.utils import get_column_letter

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Report"

    header_fill = PatternFill(start_color="6366F1", end_color="6366F1", fill_type="solid")
    header_font = Font(color="FFFFFF", bold=True)

    sheet["A1"] = data["title"]
    sheet["A1"].font = Font(bold=True, size=14)
    sheet["A2"] = data["subtitle"]

    row_idx = 4
    if data.get("summary"):
        for key, value in data["summary"].items():
            sheet.cell(row=row_idx, column=1, value=key.replace("_", " ")).font = Font(bold=True)
            sheet.cell(row=row_idx, column=2, value=value)
            row_idx += 1
        row_idx += 1

    if data["columns"]:
        for col_idx, column in enumerate(data["columns"], start=1):
            cell = sheet.cell(row=row_idx, column=col_idx, value=column)
            cell.fill = header_fill
            cell.font = header_font
        row_idx += 1
        for row in data["rows"]:
            for col_idx, value in enumerate(row, start=1):
                sheet.cell(row=row_idx, column=col_idx, value=str(value))
            row_idx += 1
        for col_idx in range(1, len(data["columns"]) + 1):
            sheet.column_dimensions[get_column_letter(col_idx)].width = 22

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def build_report_file(report) -> bytes:
    """Collect data and render the file bytes for ``report``."""
    data = collect_report_data(report)
    if report.format == "pdf":
        return _pdf_bytes(data)
    if report.format == "csv":
        return _csv_bytes(data)
    if report.format == "xlsx":
        return _xlsx_bytes(data)
    raise ValueError(f"Unsupported format: {report.format}")
