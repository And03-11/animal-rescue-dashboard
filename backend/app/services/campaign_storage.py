"""Atomic audience mutation storage for email campaigns."""

import json
import os
from pathlib import Path
from typing import Any, Iterable, Mapping
from uuid import uuid4

import pandas as pd


class CampaignMutationLockedError(RuntimeError):
    """Raised when another launch or mutation owns the campaign lock."""


class CampaignFileStorage:
    """Share the campaign lock while atomically replacing audience state."""

    def __init__(
        self,
        campaign_data_dir: str,
        sent_logs_dir: str,
        targets_dir: str,
    ) -> None:
        self.campaign_data_dir = Path(campaign_data_dir)
        self.sent_logs_dir = Path(sent_logs_dir)
        self.targets_dir = Path(targets_dir)

    def campaign_path(self, campaign_id: str) -> Path:
        return self.campaign_data_dir / f"{campaign_id}.json"

    def target_path(self, campaign_id: str) -> Path:
        return self.targets_dir / f"target_{campaign_id}.csv"

    def launch_lock_path(self, campaign_id: str) -> Path:
        return self.campaign_data_dir / f"{campaign_id}.launch.lock"

    def acquire_launch_lock(
        self, campaign_id: str, owner_id: str | None = None
    ) -> str | None:
        """Atomically reserve a campaign across launches and mutations."""
        owner_id = owner_id or uuid4().hex
        lock_path = self.launch_lock_path(campaign_id)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(
                lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            )
        except FileExistsError:
            return None

        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as lock_file:
                json.dump({"owner_id": owner_id}, lock_file)
                lock_file.flush()
                os.fsync(lock_file.fileno())
        except Exception:
            lock_path.unlink(missing_ok=True)
            raise
        return owner_id

    def owns_launch_lock(self, campaign_id: str, owner_id: str) -> bool:
        try:
            with self.launch_lock_path(campaign_id).open(
                "r", encoding="utf-8"
            ) as lock_file:
                return json.load(lock_file).get("owner_id") == owner_id
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            return False

    def is_launch_locked(self, campaign_id: str) -> bool:
        return self.launch_lock_path(campaign_id).exists()

    def release_launch_lock(self, campaign_id: str, owner_id: str) -> bool:
        if not self.owns_launch_lock(campaign_id, owner_id):
            return False
        try:
            self.launch_lock_path(campaign_id).unlink()
            return True
        except FileNotFoundError:
            return False

    def commit_audience_update(
        self,
        campaign_id: str,
        config: dict[str, Any],
        contacts: Iterable[Mapping[str, Any]],
    ) -> None:
        """Atomically replace audience config and targets under the shared lock."""
        owner_id = self.acquire_launch_lock(campaign_id)
        if owner_id is None:
            raise CampaignMutationLockedError(campaign_id)

        campaign_path = self.campaign_path(campaign_id)
        target_path = self.target_path(campaign_id)
        campaign_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        config_temporary_path = campaign_path.with_name(
            f".{campaign_path.name}.{uuid4().hex}.tmp"
        )
        target_temporary_path = target_path.with_name(
            f".{target_path.name}.{uuid4().hex}.tmp"
        )
        rollback_target_path = target_path.with_name(
            f".{target_path.name}.{uuid4().hex}.rollback"
        )
        previous_target = target_path.read_bytes() if target_path.exists() else None

        try:
            with config_temporary_path.open("w", encoding="utf-8") as campaign_file:
                json.dump(config, campaign_file, indent=4, default=str)
                campaign_file.flush()
                os.fsync(campaign_file.fileno())

            target_rows = [
                {"Email": contact.get("Email")}
                for contact in contacts
                if contact.get("Email")
            ]
            target_csv = pd.DataFrame(
                target_rows, columns=["Email"]
            ).to_csv(index=False)
            with target_temporary_path.open(
                "w", encoding="utf-8", newline=""
            ) as target_file:
                target_file.write(target_csv)
                target_file.flush()
                os.fsync(target_file.fileno())

            os.replace(target_temporary_path, target_path)
            try:
                os.replace(config_temporary_path, campaign_path)
            except Exception:
                if previous_target is None:
                    target_path.unlink(missing_ok=True)
                else:
                    with rollback_target_path.open("wb") as rollback_file:
                        rollback_file.write(previous_target)
                        rollback_file.flush()
                        os.fsync(rollback_file.fileno())
                    os.replace(rollback_target_path, target_path)
                raise
        finally:
            config_temporary_path.unlink(missing_ok=True)
            target_temporary_path.unlink(missing_ok=True)
            rollback_target_path.unlink(missing_ok=True)
            self.release_launch_lock(campaign_id, owner_id)
