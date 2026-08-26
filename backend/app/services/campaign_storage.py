"""Atomic audience mutation storage for email campaigns."""

import csv
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any, Callable, Iterable, Iterator, Mapping
from uuid import uuid4

import pandas as pd


logger = logging.getLogger(__name__)

CAMPAIGN_SUMMARY_FIELDS = frozenset(
    {
        "id",
        "createdAt",
        "campaign_name",
        "subject",
        "source_type",
        "audiences",
        "segment",
        "region",
        "is_bounced",
        "csv_filename",
        "status",
        "scheduled_at",
        "sent_count_final",
        "target_count",
        "performance",
    }
)

def summarize_campaign(campaign_data: Mapping[str, Any]) -> dict[str, Any]:
    return {
        key: value
        for key, value in campaign_data.items()
        if key in CAMPAIGN_SUMMARY_FIELDS
    }



class InvalidCampaignIdError(ValueError):
    """Raised before a non-canonical campaign ID reaches filesystem paths."""


class CampaignMutationLockedError(RuntimeError):
    """Raised when another launch or mutation owns the campaign lock."""


@dataclass(frozen=True)
class CampaignSnapshot:
    campaign: bytes | None
    target: bytes | None


class CampaignFileStorage:
    """Share the campaign lock while atomically replacing audience state."""

    def __init__(
        self,
        campaign_data_dir: str,
        sent_logs_dir: str,
        targets_dir: str,
        *,
        lock_lease_seconds: int = 300,
        now: Callable[[], datetime] | None = None,
    ) -> None:
        self.campaign_data_dir = Path(campaign_data_dir)
        self.sent_logs_dir = Path(sent_logs_dir)
        self.targets_dir = Path(targets_dir)
        self.lock_lease_seconds = lock_lease_seconds
        self._now = now or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _cleanup_temporary_path(path: Path, campaign_id: str) -> None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.warning(
                "Unable to clean temporary campaign file %s for %s",
                path,
                campaign_id,
                exc_info=True,
            )

    @staticmethod
    def validate_campaign_id(campaign_id: str) -> str:
        if not isinstance(campaign_id, str) or re.fullmatch(
            r"Campaign_[A-Za-z0-9][A-Za-z0-9_-]*", campaign_id
        ) is None:
            raise InvalidCampaignIdError("Invalid campaign ID.")
        return campaign_id

    def _contained_path(
        self,
        root: Path,
        filename: str,
        campaign_id: str,
    ) -> Path:
        self.validate_campaign_id(campaign_id)
        resolved_root = root.resolve()
        candidate = (resolved_root / filename).resolve()
        try:
            candidate.relative_to(resolved_root)
        except ValueError as error:
            raise InvalidCampaignIdError("Invalid campaign ID.") from error
        return candidate

    def campaign_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.campaign_data_dir, f"{campaign_id}.json", campaign_id
        )

    def target_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.targets_dir, f"target_{campaign_id}.csv", campaign_id
        )

    def sent_log_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.sent_logs_dir, f"sent_{campaign_id}.csv", campaign_id
        )

    def launch_lock_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.campaign_data_dir, f"{campaign_id}.launch.lock", campaign_id
        )

    def source_csv_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.targets_dir, f"target_{campaign_id}.csv", campaign_id
        )

    def campaign_exists(self, campaign_id: str) -> bool:
        return self.campaign_path(campaign_id).exists()

    def load_campaign(self, campaign_id: str) -> dict[str, Any]:
        with self.campaign_path(campaign_id).open(
            "r", encoding="utf-8"
        ) as campaign_file:
            return json.load(campaign_file)

    def save_campaign(
        self,
        campaign_id: str,
        config: dict[str, Any],
        *,
        serialize_unknown: bool = False,
    ) -> None:
        dump_options: dict[str, Any] = {"indent": 4}
        if serialize_unknown:
            dump_options["default"] = str
        campaign_path = self.campaign_path(campaign_id)
        campaign_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = campaign_path.with_name(
            f".{campaign_path.name}.{uuid4().hex}.tmp"
        )
        try:
            with temporary_path.open("w", encoding="utf-8") as campaign_file:
                json.dump(config, campaign_file, **dump_options)
                campaign_file.flush()
                os.fsync(campaign_file.fileno())
            os.replace(temporary_path, campaign_path)
        finally:
            self._cleanup_temporary_path(temporary_path, campaign_id)

    def _utc_now(self) -> datetime:
        current = self._now()
        if current.tzinfo is None:
            return current.replace(tzinfo=timezone.utc)
        return current.astimezone(timezone.utc)

    @staticmethod
    def _parse_lock_timestamp(value: Any) -> datetime | None:
        if not isinstance(value, str):
            return None
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _read_lock_payload(self, lock_path: Path) -> tuple[dict[str, Any], float] | None:
        try:
            stat = lock_path.stat()
            with lock_path.open("r", encoding="utf-8") as lock_file:
                payload = json.load(lock_file)
        except FileNotFoundError:
            return None
        except (OSError, json.JSONDecodeError):
            try:
                return {}, lock_path.stat().st_mtime
            except OSError:
                return None
        return (payload if isinstance(payload, dict) else {}), stat.st_mtime

    def _lock_is_expired(
        self,
        payload: Mapping[str, Any],
        modified_at: float,
    ) -> bool:
        expires_at = self._parse_lock_timestamp(payload.get("expires_at"))
        if expires_at is None:
            expires_at = datetime.fromtimestamp(
                modified_at, tz=timezone.utc
            ) + timedelta(seconds=self.lock_lease_seconds)
        return expires_at <= self._utc_now()

    def _reclaim_expired_lock(self, campaign_id: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        current = self._read_lock_payload(lock_path)
        if current is None or not self._lock_is_expired(*current):
            return False
        try:
            lock_path.unlink()
            return True
        except FileNotFoundError:
            return True

    def _write_lock_payload(
        self,
        lock_path: Path,
        payload: Mapping[str, Any],
        *,
        exclusive: bool,
        campaign_id: str,
    ) -> None:
        if exclusive:
            descriptor = os.open(
                lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            )
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as lock_file:
                    json.dump(payload, lock_file)
                    lock_file.flush()
                    os.fsync(lock_file.fileno())
            except Exception:
                lock_path.unlink(missing_ok=True)
                raise
            return

        temporary_path = lock_path.with_name(
            f".{lock_path.name}.{uuid4().hex}.tmp"
        )
        try:
            with temporary_path.open("w", encoding="utf-8") as lock_file:
                json.dump(payload, lock_file)
                lock_file.flush()
                os.fsync(lock_file.fileno())
            os.replace(temporary_path, lock_path)
        finally:
            self._cleanup_temporary_path(temporary_path, campaign_id)

    def acquire_launch_lock(
        self, campaign_id: str, owner_id: str | None = None
    ) -> str | None:
        """Atomically reserve a campaign, reclaiming only an expired lease."""
        owner_id = owner_id or uuid4().hex
        lock_path = self.launch_lock_path(campaign_id)
        lock_path.parent.mkdir(parents=True, exist_ok=True)

        for attempt in range(2):
            acquired_at = self._utc_now()
            payload = {
                "owner_id": owner_id,
                "acquired_at": acquired_at.isoformat(),
                "expires_at": (
                    acquired_at + timedelta(seconds=self.lock_lease_seconds)
                ).isoformat(),
            }
            try:
                self._write_lock_payload(
                    lock_path,
                    payload,
                    exclusive=True,
                    campaign_id=campaign_id,
                )
                return owner_id
            except FileExistsError:
                if attempt == 0 and self._reclaim_expired_lock(campaign_id):
                    continue
                return None
        return None

    def owns_launch_lock(self, campaign_id: str, owner_id: str) -> bool:
        current = self._read_lock_payload(self.launch_lock_path(campaign_id))
        return current is not None and current[0].get("owner_id") == owner_id

    def is_launch_locked(self, campaign_id: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        current = self._read_lock_payload(lock_path)
        if current is None:
            return False
        if not self._lock_is_expired(*current):
            return True
        self._reclaim_expired_lock(campaign_id)
        return False

    def renew_launch_lock(self, campaign_id: str, owner_id: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        current = self._read_lock_payload(lock_path)
        if current is None or current[0].get("owner_id") != owner_id:
            return False
        acquired_at = current[0].get("acquired_at")
        if self._parse_lock_timestamp(acquired_at) is None:
            acquired_at = self._utc_now().isoformat()
        payload = {
            "owner_id": owner_id,
            "acquired_at": acquired_at,
            "expires_at": (
                self._utc_now() + timedelta(seconds=self.lock_lease_seconds)
            ).isoformat(),
        }
        self._write_lock_payload(
            lock_path,
            payload,
            exclusive=False,
            campaign_id=campaign_id,
        )
        return True

    def release_launch_lock(self, campaign_id: str, owner_id: str) -> bool:
        if not self.owns_launch_lock(campaign_id, owner_id):
            return False
        try:
            self.launch_lock_path(campaign_id).unlink()
            return True
        except FileNotFoundError:
            return False

    @contextmanager
    def launch_lock_heartbeat(
        self,
        campaign_id: str,
        owner_id: str,
    ) -> Iterator[None]:
        """Renew a live send lease until the guarded operation completes."""
        stopped = threading.Event()
        interval = max(1.0, self.lock_lease_seconds / 3)

        def heartbeat() -> None:
            while not stopped.wait(interval):
                if not self.renew_launch_lock(campaign_id, owner_id):
                    return

        thread = threading.Thread(
            target=heartbeat,
            name=f"campaign-lock-{campaign_id}",
            daemon=True,
        )
        thread.start()
        try:
            yield
        finally:
            stopped.set()
            thread.join(timeout=interval + 1)

    def _atomic_write_bytes(
        self,
        path: Path,
        payload: bytes,
        campaign_id: str,
    ) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.{uuid4().hex}.tmp")
        try:
            with temporary_path.open("wb") as destination:
                destination.write(payload)
                destination.flush()
                os.fsync(destination.fileno())
            os.replace(temporary_path, path)
        finally:
            self._cleanup_temporary_path(temporary_path, campaign_id)

    def create_campaign_exclusive(
        self,
        campaign_id: str,
        config: Mapping[str, Any],
    ) -> None:
        """Create a local campaign exactly once without overwriting a collision."""
        campaign_path = self.campaign_path(campaign_id)
        campaign_path.parent.mkdir(parents=True, exist_ok=True)
        descriptor = os.open(
            campaign_path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        )
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as campaign_file:
                json.dump(dict(config), campaign_file, indent=4, default=str)
                campaign_file.flush()
                os.fsync(campaign_file.fileno())
        except Exception:
            campaign_path.unlink(missing_ok=True)
            raise

    def snapshot_campaign_state(self, campaign_id: str) -> CampaignSnapshot:
        campaign_path = self.campaign_path(campaign_id)
        target_path = self.target_path(campaign_id)
        return CampaignSnapshot(
            campaign=campaign_path.read_bytes() if campaign_path.exists() else None,
            target=target_path.read_bytes() if target_path.exists() else None,
        )

    def restore_campaign_snapshot(
        self,
        campaign_id: str,
        snapshot: CampaignSnapshot,
        *,
        owner_id: str,
    ) -> None:
        if not self.owns_launch_lock(campaign_id, owner_id):
            raise CampaignMutationLockedError(campaign_id)
        for path, payload in (
            (self.target_path(campaign_id), snapshot.target),
            (self.campaign_path(campaign_id), snapshot.campaign),
        ):
            if payload is None:
                path.unlink(missing_ok=True)
            else:
                self._atomic_write_bytes(path, payload, campaign_id)

    def save_uploaded_csv(self, campaign_id: str, content: bytes) -> Path:
        target_path = self.target_path(campaign_id)
        self._atomic_write_bytes(target_path, content, campaign_id)
        return target_path

    def append_sent_email(self, campaign_id: str, email: str) -> None:
        sent_log_path = self.sent_log_path(campaign_id)
        sent_log_path.parent.mkdir(parents=True, exist_ok=True)
        write_header = not sent_log_path.exists() or sent_log_path.stat().st_size == 0
        with sent_log_path.open("a", newline="", encoding="utf-8-sig") as log_file:
            writer = csv.DictWriter(log_file, fieldnames=["Email"])
            if write_header:
                writer.writeheader()
            writer.writerow({"Email": email})
            log_file.flush()
            os.fsync(log_file.fileno())

    def delete_created_campaign_artifacts(self, campaign_id: str) -> None:
        """Compensate a failed create without touching any other campaign."""
        for path in (
            self.campaign_path(campaign_id),
            self.target_path(campaign_id),
            self.sent_log_path(campaign_id),
        ):
            path.unlink(missing_ok=True)

    def delete_campaign_files(self, campaign_id: str) -> int:
        if not self.campaign_exists(campaign_id):
            raise FileNotFoundError(campaign_id)
        deleted = 0
        for path in (
            self.target_path(campaign_id),
            self.sent_log_path(campaign_id),
            self.campaign_path(campaign_id),
        ):
            if not path.exists():
                continue
            try:
                os.remove(path)
                deleted += 1
            except OSError:
                logger.warning(
                    "Unable to delete campaign artifact %s for %s",
                    path.name,
                    campaign_id,
                    exc_info=True,
                )
        return deleted

    def list_campaigns_with_progress(
        self,
        *,
        page_size: int = 15,
        offset: int = 0,
    ) -> dict[str, Any]:
        self.campaign_data_dir.mkdir(parents=True, exist_ok=True)
        campaign_ids: list[str] = []
        for path in sorted(
            self.campaign_data_dir.glob("Campaign_*.json"),
            reverse=True,
        ):
            try:
                campaign_ids.append(self.validate_campaign_id(path.stem))
            except InvalidCampaignIdError:
                continue

        items: list[dict[str, Any]] = []
        for campaign_id in campaign_ids[offset : offset + page_size]:
            try:
                campaign_data = self.load_campaign(campaign_id)
            except (OSError, json.JSONDecodeError):
                continue
            total = int(campaign_data.get("target_count") or 0)
            sent = 0
            sent_path = self.sent_log_path(campaign_id)
            if sent_path.exists():
                try:
                    sent_frame = pd.read_csv(sent_path)
                    sent = len(sent_frame.index)
                except (OSError, pd.errors.ParserError, pd.errors.EmptyDataError):
                    sent = 0
            summary = summarize_campaign(campaign_data)
            summary["progress"] = {
                "sent": sent,
                "total": total,
                "percentage": round((sent / total * 100) if total else 0, 2),
            }
            items.append(summary)
        return {"items": items, "total": len(campaign_ids)}

    def get_campaign_details(self, campaign_id: str) -> dict[str, Any]:
        details = self.load_campaign(campaign_id)
        target_contacts: list[str] = []
        target_path = self.target_path(campaign_id)
        if target_path.exists():
            try:
                target_frame = pd.read_csv(target_path)
                if "Email" in target_frame.columns:
                    target_contacts = (
                        target_frame["Email"].dropna().astype(str).tolist()
                    )
            except (OSError, pd.errors.ParserError, pd.errors.EmptyDataError):
                target_contacts = []

        sent_emails: set[str] = set()
        sent_path = self.sent_log_path(campaign_id)
        if sent_path.exists():
            try:
                sent_frame = pd.read_csv(sent_path)
                if "Email" in sent_frame.columns:
                    sent_emails = {
                        value.strip().lower()
                        for value in sent_frame["Email"].dropna().astype(str)
                    }
            except (OSError, pd.errors.ParserError, pd.errors.EmptyDataError):
                sent_emails = set()

        contacts = [
            {
                "email": email,
                "status": "Sent" if email.strip().lower() in sent_emails else "Pending",
            }
            for email in target_contacts
            if email.strip()
        ]
        return {"details": details, "contacts": contacts}

    def recover_interrupted_campaigns(self) -> list[str]:
        """Recover crashed sends without disturbing live lease owners."""
        recovered: list[str] = []
        self.campaign_data_dir.mkdir(parents=True, exist_ok=True)
        for campaign_path in sorted(self.campaign_data_dir.glob("Campaign_*.json")):
            campaign_id = campaign_path.stem
            try:
                self.validate_campaign_id(campaign_id)
                config = self.load_campaign(campaign_id)
            except (InvalidCampaignIdError, OSError, json.JSONDecodeError):
                continue
            if config.get("status") not in {"Launching", "Sending"}:
                continue
            if self.is_launch_locked(campaign_id):
                continue
            config["status"] = "Interrupted"
            config["interrupted_at"] = self._utc_now().isoformat()
            self.save_campaign(campaign_id, config, serialize_unknown=True)
            recovered.append(campaign_id)
        return recovered

    def commit_audience_update(
        self,
        campaign_id: str,
        config: dict[str, Any],
        contacts: Iterable[Mapping[str, Any]],
        *,
        owner_id: str,
    ) -> None:
        """Atomically replace audience state using the caller-owned shared lock."""
        if not self.owns_launch_lock(campaign_id, owner_id):
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
            self._cleanup_temporary_path(config_temporary_path, campaign_id)
            self._cleanup_temporary_path(target_temporary_path, campaign_id)
            self._cleanup_temporary_path(rollback_target_path, campaign_id)
