from __future__ import annotations

from jacobian_factory.cli import main


def test_cli_success(capsys) -> None:
    exit_code = main(["--count", "2", "--verify-through", "4"])
    captured = capsys.readouterr()
    assert exit_code == 0
    assert "d=3: ok=True" in captured.out
    assert "d=4: ok=True" in captured.out
