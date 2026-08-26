"""CSV preview parsing shared by the email campaign workflow."""

import csv
import os
from typing import Any, Mapping, Optional

import pandas as pd


CsvRow = Optional[list[str]]


def read_csv_preview_rows(csv_path: str | os.PathLike[str]) -> tuple[CsvRow, CsvRow, str]:
    """Read the first two CSV rows while preserving the legacy detection rules."""
    delimiter = ","

    try:
        print("Attempting to read CSV with utf-8-sig encoding...")
        with open(csv_path, "r", newline="", encoding="utf-8-sig") as csvfile:
            sniffer = csv.Sniffer()
            sample = csvfile.read(4096)
            try:
                dialect = sniffer.sniff(sample, delimiters=",;\t|")
                delimiter = dialect.delimiter
            except csv.Error as sniff_err:
                print(f"Sniffer failed: {sniff_err}. Trying common delimiters...")
                for test_delimiter in [",", ";", "\t", "|"]:
                    if test_delimiter in sample:
                        delimiter = test_delimiter
                        print(f"Using detected delimiter: '{delimiter}'")
                        break

            csvfile.seek(0)
            reader = csv.reader(csvfile, delimiter=delimiter)
            first_row = next(reader, None)
            second_row = next(reader, None)
            print(f"Successfully read preview with utf-8-sig. Delimiter: '{delimiter}'")
    except UnicodeDecodeError:
        print("UTF-8 decoding failed. Attempting to read CSV with latin-1 encoding...")
        with open(csv_path, "r", newline="", encoding="latin-1") as csvfile:
            sniffer = csv.Sniffer()
            try:
                sample = csvfile.read(2048)
                dialect = sniffer.sniff(sample)
                delimiter = dialect.delimiter
                csvfile.seek(0)
            except csv.Error:
                delimiter = ","
                csvfile.seek(0)
                print("Could not detect delimiter with latin-1, defaulting to ','")

            reader = csv.reader(csvfile, delimiter=delimiter)
            first_row = next(reader, None)
            second_row = next(reader, None)
            print(f"Successfully read preview with latin-1. Delimiter: '{delimiter}'")

    return first_row, second_row, delimiter


def read_mapped_contacts(
    csv_path: str | os.PathLike[str],
    mapping: Mapping[str, Any],
    campaign_id: str,
) -> list[dict[str, str]]:
    """Load campaign contacts while preserving the existing mapping behavior."""
    delimiter = ","
    with open(csv_path, "r", newline="", encoding="utf-8-sig") as csvfile:
        try:
            sample = csvfile.read(2048)
            delimiter = csv.Sniffer().sniff(sample).delimiter
            print(f"[{campaign_id}] Delimiter detected for processing: '{delimiter}'")
        except csv.Error:
            print(f"[{campaign_id}] Delimiter detection failed, using default: ','")

    has_header = mapping.get("has_header", False)
    dataframe = pd.read_csv(
        csv_path,
        delimiter=delimiter,
        dtype=str,
        keep_default_na=False,
        header=0 if has_header else None,
    )
    print(f"[{campaign_id}] CSV loaded into DataFrame. Columns found: {dataframe.columns.tolist()}")

    email_column = mapping["email"]
    name_column = mapping["name"]

    if has_header:
        if email_column not in dataframe.columns:
            raise ValueError(
                f"Saved email column '{email_column}' not found in actual CSV header: "
                f"{dataframe.columns.tolist()}"
            )
        if name_column not in dataframe.columns:
            raise ValueError(
                f"Saved name column '{name_column}' not found in actual CSV header: "
                f"{dataframe.columns.tolist()}"
            )
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
            raise ValueError(
                "Invalid generic column reference in saved mapping "
                f"('{email_column}', '{name_column}'). Error: {error}"
            ) from error

    print(
        f"[{campaign_id}] Accessing DataFrame columns using -> "
        f"Email key: '{actual_email_key}', Name key: '{actual_name_key}'"
    )

    contacts: list[dict[str, str]] = []
    seen_emails: set[str] = set()
    for index, row in dataframe.iterrows():
        email_value = str(row[actual_email_key]).strip() if actual_email_key in row else ""
        name_value = str(row[actual_name_key]).strip() if actual_name_key in row else ""
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
        elif email_value and normalized_email not in seen_emails:
            print(
                f"[{campaign_id}] WARNING: Skipping row {index} due to invalid "
                f"email format: '{email_value}'"
            )

    print(f"[{campaign_id}] Processed {len(contacts)} valid contacts from CSV.")
    return contacts
