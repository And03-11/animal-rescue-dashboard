"""CSV parsing shared by upload, preview, mapping, and campaign delivery."""

import csv
from dataclasses import dataclass
import io
import os
from pathlib import Path
from typing import Any, Mapping, Optional

import pandas as pd


CsvRow = Optional[list[str]]
SUPPORTED_CSV_DELIMITERS = (",", ";", "\t", "|")


@dataclass(frozen=True)
class CsvFormat:
    encoding: str
    delimiter: str
    first_row: CsvRow
    second_row: CsvRow


def inspect_csv_content(content: bytes) -> CsvFormat:
    """Decode and sniff one payload with rules shared by every CSV consumer."""
    if not content or b"\x00" in content:
        raise ValueError("Invalid CSV content")
    try:
        text = content.decode("utf-8-sig")
        encoding = "utf-8-sig"
    except UnicodeDecodeError:
        text = content.decode("latin-1")
        encoding = "latin-1"

    sample = text[:65_536]
    try:
        delimiter = csv.Sniffer().sniff(
            sample, delimiters="".join(SUPPORTED_CSV_DELIMITERS)
        ).delimiter
    except csv.Error:
        first_line = next((line for line in sample.splitlines() if line), "")
        delimiter = max(
            SUPPORTED_CSV_DELIMITERS,
            key=lambda candidate: first_line.count(candidate),
        )

    reader = csv.reader(io.StringIO(text, newline=""), delimiter=delimiter)
    first_row = next(reader, None)
    second_row = next(reader, None)
    return CsvFormat(
        encoding=encoding,
        delimiter=delimiter,
        first_row=first_row,
        second_row=second_row,
    )


def inspect_csv_file(csv_path: str | os.PathLike[str]) -> CsvFormat:
    return inspect_csv_content(Path(csv_path).read_bytes())


def read_csv_preview_rows(
    csv_path: str | os.PathLike[str],
) -> tuple[CsvRow, CsvRow, str]:
    """Read preview rows using the exact dialect and encoding used at send time."""
    csv_format = inspect_csv_file(csv_path)
    return (
        csv_format.first_row,
        csv_format.second_row,
        csv_format.delimiter,
    )


def read_mapped_contacts(
    csv_path: str | os.PathLike[str],
    mapping: Mapping[str, Any],
    campaign_id: str,
) -> list[dict[str, str]]:
    """Load normalized, valid, case-insensitively deduplicated recipients."""
    csv_format = inspect_csv_file(csv_path)
    has_header = mapping.get("has_header", False)
    dataframe = pd.read_csv(
        csv_path,
        delimiter=csv_format.delimiter,
        encoding=csv_format.encoding,
        dtype=str,
        keep_default_na=False,
        header=0 if has_header else None,
    )

    email_column = mapping["email"]
    name_column = mapping["name"]

    if has_header:
        if email_column not in dataframe.columns:
            raise ValueError(f"Saved email column '{email_column}' was not found")
        if name_column not in dataframe.columns:
            raise ValueError(f"Saved name column '{name_column}' was not found")
        actual_email_key: str | int = email_column
        actual_name_key: str | int = name_column
    else:
        try:
            email_column_index = int(email_column.split(" ")[-1]) - 1
            name_column_index = int(name_column.split(" ")[-1]) - 1
            if not 0 <= email_column_index < len(dataframe.columns):
                raise IndexError("Email index out of bounds")
            if not 0 <= name_column_index < len(dataframe.columns):
                raise IndexError("Name index out of bounds")
            actual_email_key = email_column_index
            actual_name_key = name_column_index
        except (ValueError, IndexError, AttributeError) as error:
            raise ValueError("Invalid generic column reference in saved mapping") from error

    contacts: list[dict[str, str]] = []
    seen_emails: set[str] = set()
    for _index, row in dataframe.iterrows():
        email_value = str(row[actual_email_key]).strip()
        name_value = str(row[actual_name_key]).strip()
        normalized_email = email_value.lower()
        if (
            email_value
            and "@" in email_value
            and "." in email_value.split("@")[-1]
            and normalized_email not in seen_emails
        ):
            seen_emails.add(normalized_email)
            contacts.append(
                {"Email": email_value, "Name": name_value or "Valued Supporter"}
            )

    return contacts
