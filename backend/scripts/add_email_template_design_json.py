"""Add editable GrapesJS project state to email templates."""

from sqlalchemy import inspect, text

from backend.app.db.database import engine


def main() -> None:
    inspector = inspect(engine)
    columns = {column["name"] for column in inspector.get_columns("email_templates")}
    if "design_json" in columns:
        print("email_templates.design_json already exists")
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE email_templates ADD COLUMN design_json TEXT"))
    print("email_templates.design_json added")


if __name__ == "__main__":
    main()
