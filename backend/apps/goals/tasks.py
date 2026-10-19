"""Celery tasks — daily goal milestone checks (ARCHITECTURE.md §10)."""
import logging

from celery import shared_task

logger = logging.getLogger(__name__)

MILESTONES = (25, 50, 75, 100)


@shared_task
def check_goal_milestones():
    """Evaluate every active goal; notify on newly crossed milestones."""
    from apps.goals.models import Goal
    from apps.goals.services import goal_progress

    notified = 0
    for goal in Goal.objects.select_related("owner").filter(is_achieved=False):
        progress = goal_progress(goal)
        pct = progress["progress_pct"]
        crossed = [m for m in MILESTONES if m >= pct and (goal.last_milestone_notified or 0) < m]
        if not crossed:
            continue
        latest = max(crossed)
        if latest >= 100:
            goal.is_achieved = True
        goal.last_milestone_notified = latest
        goal.save(update_fields=["is_achieved", "last_milestone_notified", "updated_at"])

        from apps.notifications.services import notify

        if latest >= 100:
            notify(
                goal.owner,
                "goal_milestone",
                "Goal achieved 🎉",
                f"Congratulations — your goal “{goal.name}” has reached 100% of its target.",
                {"goal_id": str(goal.id), "progress_pct": pct},
            )
        else:
            notify(
                goal.owner,
                "goal_milestone",
                f"Goal milestone: {latest}%
                f"Your goal “{goal.name}” just passed {latest}% of its target.",
                {"goal_id": str(goal.id), "progress_pct": pct, "milestone": latest},
            )
        notified += 1
    logger.info("check_goal_milestones: %s notification(s) sent", notified)
    return notified
