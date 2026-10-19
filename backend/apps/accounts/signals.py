from django.apps import apps as django_apps
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import User


@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    """Automatically create a Profile whenever a User is created."""
    if created:
        Profile = django_apps.get_model("accounts", "Profile")
        Profile.objects.create(user=instance)
