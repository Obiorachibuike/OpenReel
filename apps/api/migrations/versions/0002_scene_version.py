"""Optimistic concurrency for scene edits."""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade():
    op.add_column(
        "scenes", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )


def downgrade():
    op.drop_column("scenes", "version")
