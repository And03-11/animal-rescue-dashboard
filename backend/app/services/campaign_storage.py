"""File-backed campaign queries used by the email sender endpoints."""

import csv
import json
import logging
import os
import re
import shutil
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, BinaryIO, Iterable, Mapping
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
        "click_tracking_enabled",
    }
)


@dataclass(frozen=True)
class CampaignDeletionResult:
    deleted_count: int
    errors: tuple[str, ...]



class InvalidCampaignIdError(ValueError):
    """Raised before a non-canonical campaign ID reaches filesystem paths."""


class CampaignMutationLockedError(RuntimeError):
    """Raised when another launch or mutation owns the campaign lock."""

class CampaignFileStorage:
    """Keep legacy JSON and CSV persistence behind one small interface."""

    def __init__(
        self,
        campaign_data_dir: str,
        sent_logs_dir: str,
        targets_dir: str,
    ) -> None:
        self.campaign_data_dir = Path(campaign_data_dir)
        self.sent_logs_dir = Path(sent_logs_dir)
        self.targets_dir = Path(targets_dir)

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

    def campaign_exists(self, campaign_id: str) -> bool:
        return self.campaign_path(campaign_id).exists()

    def load_campaign(self, campaign_id: str) -> dict[str, Any]:
        with self.campaign_path(campaign_id).open("r", encoding="utf-8") as campaign_file:
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

    def acquire_launch_lock(
        self, campaign_id: str, owner_id: str | None = None
    ) -> str | None:
        """Atomically reserve a campaign execution across requests/processes."""
        owner_id = owner_id or uuid4().hex
        lock_path = self.launch_lock_path(campaign_id)
        lock_path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "campaign_id": campaign_id,
            "owner_id": owner_id,
            "pid": os.getpid(),
            "acquired_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            descriptor = os.open(
                lock_path,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY,
            )
        except FileExistsError:
            return None

        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as lock_file:
                json.dump(payload, lock_file)
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

    def recover_interrupted_campaigns(self) -> list[str]:
        """Clear stale launch locks and expose interrupted sends for safe retry."""
        recovered: list[str] = []
        self.campaign_data_dir.mkdir(parents=True, exist_ok=True)

        for lock_path in self.campaign_data_dir.glob("*.launch.lock"):
            lock_path.unlink(missing_ok=True)

        for campaign_path in self.campaign_data_dir.glob("*.json"):
            campaign_id = campaign_path.stem
            try:
                config = self.load_campaign(campaign_id)
            except (OSError, json.JSONDecodeError):
                continue
            if config.get("status") not in {"Launching", "Sending"}:
                continue
            config["status"] = "Interrupted"
            config["interrupted_at"] = datetime.now(timezone.utc).isoformat()
            self.save_campaign(campaign_id, config, serialize_unknown=True)
            recovered.append(campaign_id)
        return recovered

    def write_target_contacts(
        self,
        campaign_id: str,
        contacts: Iterable[Mapping[str, Any]],
    ) -> None:
        target_rows = [
            {"Email": contact.get("Email")}
            for contact in contacts
            if contact.get("Email")
        ]
        pd.DataFrame(target_rows).to_csv(self.target_path(campaign_id), index=False)


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
    def append_sent_email(
        self,
        campaign_id: str,
        email: str,
        *,
        gmail_message_id: str | None = None,
    ) -> None:
        """Durably append Gmail acceptance evidence to the resume ledger."""
        sent_log_path = self.sent_log_path(campaign_id)
        sent_log_path.parent.mkdir(parents=True, exist_ok=True)

        if gmail_message_id is not None:
            gmail_message_id = gmail_message_id.strip()
            if not gmail_message_id:
                raise ValueError("Gmail message ID must be nonempty")

        existing_fieldnames: list[str] = []
        existing_rows: list[dict[str, str]] = []
        needs_message_id_upgrade = False
        if sent_log_path.exists() and sent_log_path.stat().st_size > 0:
            with sent_log_path.open(
                "r", newline="", encoding="utf-8-sig"
            ) as existing_file:
                reader = csv.DictReader(existing_file)
                existing_fieldnames = list(reader.fieldnames or [])
                if "Email" not in existing_fieldnames:
                    raise ValueError("Sent ledger is missing the Email column")
                if (
                    gmail_message_id is not None
                    and "GmailMessageId" not in existing_fieldnames
                ):
                    needs_message_id_upgrade = True
                    existing_rows = list(reader)

        if needs_message_id_upgrade:
            upgraded_fieldnames = [*existing_fieldnames, "GmailMessageId"]
            temporary_path = sent_log_path.with_name(
                f".{sent_log_path.name}.{uuid4().hex}.tmp"
            )
            try:
                with temporary_path.open(
                    "w", newline="", encoding="utf-8-sig"
                ) as temporary_file:
                    writer = csv.DictWriter(
                        temporary_file, fieldnames=upgraded_fieldnames
                    )
                    writer.writeheader()
                    writer.writerows(existing_rows)
                    writer.writerow(
                        {
                            "Email": email,
                            "GmailMessageId": gmail_message_id,
                        }
                    )
                    temporary_file.flush()
                    os.fsync(temporary_file.fileno())
                os.replace(temporary_path, sent_log_path)
                return
            finally:
                self._cleanup_temporary_path(temporary_path, campaign_id)

        write_header = not sent_log_path.exists() or sent_log_path.stat().st_size == 0
        fieldnames = existing_fieldnames or [
            "Email",
            *(["GmailMessageId"] if gmail_message_id is not None else []),
        ]
        with sent_log_path.open("a", newline="", encoding="utf-8-sig") as log_file:
            writer = csv.DictWriter(log_file, fieldnames=fieldnames)
            if write_header:
                writer.writeheader()
            row = {"Email": email}
            if "GmailMessageId" in fieldnames:
                row["GmailMessageId"] = gmail_message_id or ""
            writer.writerow(row)
            log_file.flush()
            os.fsync(log_file.fileno())

    def save_uploaded_csv(self, campaign_id: str, source_file: BinaryIO) -> Path:
        target_path = self.target_path(campaign_id)
        with target_path.open("wb") as destination:
            shutil.copyfileobj(source_file, destination)
        return target_path

    def delete_campaign_files(self, campaign_id: str) -> CampaignDeletionResult:
        """Delete config, targets and sent log with the legacy partial-failure policy."""
        campaign_path = self.campaign_path(campaign_id)
        if not campaign_path.exists():
            raise FileNotFoundError(campaign_id)

        files_to_delete = (
            campaign_path,
            self.target_path(campaign_id),
            self.sent_log_path(campaign_id),
            self.launch_lock_path(campaign_id),
        )
        deleted_count = 0
        errors: list[str] = []

        for file_path in files_to_delete:
            if file_path.exists():
                try:
                    os.remove(file_path)
                    print(f"  - Archivo eliminado: {file_path.name}")
                    deleted_count += 1
                except OSError as error:
                    error_message = f"Error al eliminar {file_path.name}: {error}"
                    print(f"  - {error_message}")
                    errors.append(error_message)
            else:
                print(f"  - Archivo no encontrado (omitido): {file_path.name}")

        if errors:
            print(f"[{campaign_id}] Eliminación completada con {len(errors)} errores.")
        print(f"[{campaign_id}] Eliminación completada. {deleted_count} archivos eliminados.")
        return CampaignDeletionResult(deleted_count, tuple(errors))

    def list_campaigns_with_progress(self, *, page_size: int = 15, offset: int = 0) -> dict[str, Any]:
        campaign_paths = [
            path
            for path in sorted(self.campaign_data_dir.iterdir(), reverse=True)
            if path.suffix == ".json"
        ]
        total = len(campaign_paths)
        campaigns: list[dict[str, Any]] = []
        for path in campaign_paths[offset : offset + page_size]:
            try:
                with path.open("r", encoding="utf-8") as campaign_file:
                    campaign_data = json.load(campaign_file)
                campaign_data.setdefault("click_tracking_enabled", False)

                total_contacts = campaign_data.get("target_count", 0)
                campaign_id = campaign_data.get("id")
                sent_count = 0
                sent_log_path = self.sent_log_path(campaign_id)
                if sent_log_path.exists():
                    try:
                        sent_count = len(pd.read_csv(sent_log_path))
                    except pd.errors.EmptyDataError:
                        sent_count = 0

                percentage = (
                    sent_count / total_contacts * 100 if total_contacts > 0 else 0
                )
                campaign_summary = {
                    key: value
                    for key, value in campaign_data.items()
                    if key in CAMPAIGN_SUMMARY_FIELDS
                }
                campaign_summary["progress"] = {
                    "sent": sent_count,
                    "total": total_contacts,
                    "percentage": round(percentage, 2),
                }
                campaigns.append(campaign_summary)
            except Exception as error:
                print(f"ERROR al procesar {path.name}: {error}")

        return {"items": campaigns, "total": total}

    def get_campaign_details(self, campaign_id: str) -> dict[str, Any]:
        campaign_details = self.load_campaign(campaign_id)
        campaign_details.setdefault("click_tracking_enabled", False)

        target_contacts: list[str] = []
        target_path = self.target_path(campaign_id)
        if target_path.exists():
            try:
                target_frame = pd.read_csv(target_path)
                if "Email" in target_frame.columns:
                    target_contacts = (
                        target_frame["Email"].dropna().astype(str).tolist()
                    )
            except Exception as error:
                print(f"Error reading target csv for {campaign_id}: {error}")

        sent_emails: set[str] = set()
        sent_log_path = self.sent_log_path(campaign_id)
        if sent_log_path.exists():
            try:
                sent_frame = pd.read_csv(sent_log_path)
                if "Email" in sent_frame.columns:
                    sent_emails = set(
                        sent_frame["Email"].dropna().astype(str).str.lower()
                    )
            except Exception as error:
                print(f"Error reading sent log for {campaign_id}: {error}")

        contacts = [
            {
                "email": email,
                "status": "Sent" if email.lower() in sent_emails else "Pending",
            }
            for email in target_contacts
            if isinstance(email, str) and email.strip()
        ]
        return {"details": campaign_details, "contacts": contacts}
