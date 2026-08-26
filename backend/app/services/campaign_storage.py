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

if os.name == "nt":
    import msvcrt
else:
    import fcntl

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


class CampaignLeaseLostError(RuntimeError):
    """Raised when a worker no longer owns its generation-fenced launch lease."""


class LaunchLease(str):
    """String-compatible owner token carrying an unforgeable fence generation."""

    generation: str

    def __new__(cls, owner_id: str, generation: str):
        lease = str.__new__(cls, owner_id)
        lease.generation = generation
        return lease


class LaunchLeaseGuard:
    def __init__(
        self,
        storage: "CampaignFileStorage",
        campaign_id: str,
        lease: LaunchLease,
    ) -> None:
        self.storage = storage
        self.campaign_id = campaign_id
        self.lease = lease
        self.lost = threading.Event()

    def mark_lost(self) -> None:
        self.lost.set()

    def ensure_owned(self) -> None:
        if self.lost.is_set() or not self.storage.owns_launch_lock(
            self.campaign_id, self.lease
        ):
            self.lost.set()
            raise CampaignLeaseLostError(
                f"Launch lease lost for {self.campaign_id}"
            )


@dataclass(frozen=True)
class CampaignSnapshot:
    campaign: bytes | None
    target: bytes | None


class CampaignFileStorage:
    """Share the campaign lock while atomically replacing audience state."""

    _thread_guard_registry_lock = threading.Lock()
    _thread_guards: dict[str, threading.RLock] = {}

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

    def launch_guard_path(self, campaign_id: str) -> Path:
        return self._contained_path(
            self.campaign_data_dir, f"{campaign_id}.launch.guard", campaign_id
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

    def save_campaign_owned(
        self,
        campaign_id: str,
        config: dict[str, Any],
        *,
        lease: str,
        serialize_unknown: bool = False,
    ) -> None:
        """Persist campaign state only while this exact fence still owns the lease."""
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(self.launch_lock_path(campaign_id))
            if (
                current is None
                or self._lock_is_expired(*current)
                or not self._lease_matches(current[0], lease)
            ):
                raise CampaignLeaseLostError(campaign_id)
            self.save_campaign(
                campaign_id,
                config,
                serialize_unknown=serialize_unknown,
            )

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

    @classmethod
    def _thread_guard_for(cls, guard_path: Path) -> threading.RLock:
        guard_key = str(guard_path.resolve())
        with cls._thread_guard_registry_lock:
            return cls._thread_guards.setdefault(guard_key, threading.RLock())

    @contextmanager
    def _lease_mutation_guard(self, campaign_id: str) -> Iterator[None]:
        """Serialize one lease CAS across threads and independent processes."""
        guard_path = self.launch_guard_path(campaign_id)
        guard_path.parent.mkdir(parents=True, exist_ok=True)
        thread_guard = self._thread_guard_for(guard_path)
        with thread_guard:
            descriptor = os.open(guard_path, os.O_CREAT | os.O_RDWR)
            locked = False
            try:
                if os.fstat(descriptor).st_size == 0:
                    os.write(descriptor, b"\0")
                    os.fsync(descriptor)
                os.lseek(descriptor, 0, os.SEEK_SET)
                if os.name == "nt":
                    msvcrt.locking(descriptor, msvcrt.LK_LOCK, 1)
                else:
                    fcntl.flock(descriptor, fcntl.LOCK_EX)
                locked = True
                yield
            finally:
                if locked:
                    os.lseek(descriptor, 0, os.SEEK_SET)
                    if os.name == "nt":
                        msvcrt.locking(descriptor, msvcrt.LK_UNLCK, 1)
                    else:
                        fcntl.flock(descriptor, fcntl.LOCK_UN)
                os.close(descriptor)

    @staticmethod
    def _lease_matches(payload: Mapping[str, Any], lease: str) -> bool:
        if payload.get("owner_id") != str(lease):
            return False
        expected_generation = getattr(lease, "generation", None)
        actual_generation = payload.get("generation")
        if actual_generation is None:
            return expected_generation is None
        return (
            isinstance(expected_generation, str)
            and expected_generation == actual_generation
        )

    def _assert_launch_lease_owned_unlocked(
        self,
        campaign_id: str,
        lease: str,
        *,
        error_type: type[RuntimeError],
    ) -> None:
        """Assert one exact live fence while the mutation guard is held."""
        current = self._read_lock_payload(self.launch_lock_path(campaign_id))
        if (
            current is None
            or self._lock_is_expired(*current)
            or not self._lease_matches(current[0], lease)
        ):
            raise error_type(campaign_id)

    def _reclaim_expired_lock(self, campaign_id: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(lock_path)
            if current is None or not self._lock_is_expired(*current):
                return False
            lock_path.unlink(missing_ok=True)
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
    ) -> LaunchLease | None:
        """CAS one generation-fenced lease, replacing it only after expiry."""
        owner_id = owner_id or uuid4().hex
        lock_path = self.launch_lock_path(campaign_id)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(lock_path)
            if current is not None and not self._lock_is_expired(*current):
                return None
            acquired_at = self._utc_now()
            generation = uuid4().hex
            payload = {
                "owner_id": owner_id,
                "generation": generation,
                "acquired_at": acquired_at.isoformat(),
                "expires_at": (
                    acquired_at + timedelta(seconds=self.lock_lease_seconds)
                ).isoformat(),
            }
            try:
                self._write_lock_payload(
                    lock_path,
                    payload,
                    exclusive=current is None,
                    campaign_id=campaign_id,
                )
            except FileExistsError:
                return None
            return LaunchLease(owner_id, generation)

    def owns_launch_lock(self, campaign_id: str, lease: str) -> bool:
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(self.launch_lock_path(campaign_id))
            return (
                current is not None
                and not self._lock_is_expired(*current)
                and self._lease_matches(current[0], lease)
            )

    def is_launch_locked(self, campaign_id: str) -> bool:
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(self.launch_lock_path(campaign_id))
            return current is not None and not self._lock_is_expired(*current)

    def renew_launch_lock(self, campaign_id: str, lease: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(lock_path)
            if (
                current is None
                or self._lock_is_expired(*current)
                or not self._lease_matches(current[0], lease)
            ):
                return False
            acquired_at = current[0].get("acquired_at")
            if self._parse_lock_timestamp(acquired_at) is None:
                acquired_at = self._utc_now().isoformat()
            payload = {
                "owner_id": str(lease),
                "generation": current[0].get("generation"),
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

    def release_launch_lock(self, campaign_id: str, lease: str) -> bool:
        lock_path = self.launch_lock_path(campaign_id)
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(lock_path)
            if current is None or not self._lease_matches(current[0], lease):
                return False
            lock_path.unlink(missing_ok=True)
            return True

    @contextmanager
    def launch_lock_heartbeat(
        self,
        campaign_id: str,
        lease: LaunchLease,
    ) -> Iterator[LaunchLeaseGuard]:
        """Renew a live send lease until the guarded operation completes."""
        stopped = threading.Event()
        interval = max(1.0, self.lock_lease_seconds / 3)
        guard = LaunchLeaseGuard(self, campaign_id, lease)
        guard.ensure_owned()

        def heartbeat() -> None:
            while not stopped.wait(interval):
                if not self.renew_launch_lock(campaign_id, lease):
                    guard.mark_lost()
                    return

        thread = threading.Thread(
            target=heartbeat,
            name=f"campaign-lock-{campaign_id}",
            daemon=True,
        )
        thread.start()
        try:
            yield guard
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

    def _write_optional_bytes_unlocked(
        self,
        path: Path,
        payload: bytes | None,
        campaign_id: str,
    ) -> None:
        if payload is None:
            path.unlink(missing_ok=True)
        else:
            self._atomic_write_bytes(path, payload, campaign_id)

    def restore_campaign_snapshot(
        self,
        campaign_id: str,
        snapshot: CampaignSnapshot,
        *,
        owner_id: str,
    ) -> None:
        target_path = self.target_path(campaign_id)
        campaign_path = self.campaign_path(campaign_id)
        with self._lease_mutation_guard(campaign_id):
            self._assert_launch_lease_owned_unlocked(
                campaign_id,
                owner_id,
                error_type=CampaignMutationLockedError,
            )
            previous = CampaignSnapshot(
                campaign=(
                    campaign_path.read_bytes() if campaign_path.exists() else None
                ),
                target=target_path.read_bytes() if target_path.exists() else None,
            )
            try:
                self._write_optional_bytes_unlocked(
                    target_path, snapshot.target, campaign_id
                )
                self._write_optional_bytes_unlocked(
                    campaign_path, snapshot.campaign, campaign_id
                )
            except Exception:
                for path, payload in (
                    (target_path, previous.target),
                    (campaign_path, previous.campaign),
                ):
                    try:
                        self._write_optional_bytes_unlocked(
                            path, payload, campaign_id
                        )
                    except Exception:
                        logger.exception(
                            "Unable to roll back partial snapshot restore for %s",
                            campaign_id,
                        )
                raise

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

    def append_sent_email_owned(
        self,
        campaign_id: str,
        email: str,
        *,
        lease: str,
    ) -> None:
        with self._lease_mutation_guard(campaign_id):
            current = self._read_lock_payload(self.launch_lock_path(campaign_id))
            if (
                current is None
                or self._lock_is_expired(*current)
                or not self._lease_matches(current[0], lease)
            ):
                raise CampaignLeaseLostError(campaign_id)
            self.append_sent_email(campaign_id, email)

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
        campaign_path = self.campaign_path(campaign_id)
        target_path = self.target_path(campaign_id)
        config_temporary_path = campaign_path.with_name(
            f".{campaign_path.name}.{uuid4().hex}.tmp"
        )
        target_temporary_path = target_path.with_name(
            f".{target_path.name}.{uuid4().hex}.tmp"
        )
        rollback_target_path = target_path.with_name(
            f".{target_path.name}.{uuid4().hex}.rollback"
        )
        with self._lease_mutation_guard(campaign_id):
            self._assert_launch_lease_owned_unlocked(
                campaign_id,
                owner_id,
                error_type=CampaignMutationLockedError,
            )
            campaign_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            previous_target = (
                target_path.read_bytes() if target_path.exists() else None
            )
            try:
                with config_temporary_path.open(
                    "w", encoding="utf-8"
                ) as campaign_file:
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
