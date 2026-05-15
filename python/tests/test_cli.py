from __future__ import annotations

import json

from llm_key_validator.cli import CliIO, mask_key, run_cli


def _make_io(
    env: dict[str, str] | None = None,
    stdin_text: str = "",
    files: dict[str, str] | None = None,
    stdin_is_tty: bool = False,
) -> tuple[CliIO, list[str], list[str]]:
    out: list[str] = []
    err: list[str] = []
    file_map = files or {}
    io = CliIO(
        stdout=lambda line: out.append(line),
        stderr=lambda line: err.append(line),
        env=env or {},
        stdin_is_tty=stdin_is_tty,
        stdout_is_tty=False,  # disable color in tests
        read_stdin=lambda: stdin_text,
        read_file=lambda p: file_map.get(p),
    )
    return io, out, err


class TestHelpAndVersion:
    def test_help(self):
        io, out, _ = _make_io()
        code = run_cli(["--help"], io)
        assert code == 0
        assert any("llm-key-validator" in line for line in out)

    def test_version(self):
        io, out, _ = _make_io()
        code = run_cli(["--version"], io)
        assert code == 0
        assert len(out) == 1


class TestListProviders:
    def test_text_output(self):
        io, out, _ = _make_io()
        code = run_cli(["--list-providers"], io)
        assert code == 0
        joined = "\n".join(out)
        for expected in ("openai", "anthropic", "perplexity", "together"):
            assert expected in joined

    def test_json_output(self):
        io, out, _ = _make_io()
        code = run_cli(["--list-providers", "--json"], io)
        assert code == 0
        payload = json.loads(out[0])
        names = {p["name"] for p in payload}
        assert "openai" in names
        assert len(payload) == 12


class TestUsageErrors:
    def test_no_keys_returns_1(self):
        io, _, err = _make_io()
        code = run_cli([], io)
        assert code == 1
        assert any("Error" in line for line in err)

    def test_unknown_option_returns_1(self):
        io, _, err = _make_io()
        code = run_cli(["--bogus"], io)
        assert code == 1
        assert any("Unknown option" in line for line in err)

    def test_provider_requires_value(self):
        io, _, err = _make_io()
        code = run_cli(["--provider"], io)
        assert code == 1

    def test_timeout_requires_value(self):
        io, _, err = _make_io()
        code = run_cli(["--timeout"], io)
        assert code == 1

    def test_invalid_timeout(self):
        io, _, err = _make_io()
        code = run_cli(["--timeout", "abc"], io)
        assert code == 1

    def test_stdin_with_tty_errors(self):
        io, _, err = _make_io(stdin_is_tty=True)
        code = run_cli(["--stdin"], io)
        assert code == 1


class TestOfflineValidate:
    def test_valid_anthropic_key_offline(self):
        io, out, _ = _make_io()
        code = run_cli(
            ["--offline", "sk-ant-abcdefghijklmnopqrstuvwxyz"],
            io,
        )
        assert code == 0
        assert any("VALID" in line for line in out)

    def test_invalid_key_offline(self):
        io, out, _ = _make_io()
        code = run_cli(["--offline", "garbage-key"], io)
        assert code == 2
        assert any("UNKNOWN PROVIDER" in line for line in out)

    def test_json_output(self):
        io, out, _ = _make_io()
        code = run_cli(
            ["--offline", "--json", "sk-ant-abcdefghijklmnopqrstuvwxyz"],
            io,
        )
        assert code == 0
        payload = json.loads(out[0])
        assert payload[0]["valid"] is True
        assert payload[0]["provider"] == "anthropic"
        assert "key" in payload[0]


class TestStdin:
    def test_reads_keys_from_stdin(self):
        io, out, _ = _make_io(
            stdin_text="sk-ant-abcdefghijklmnopqrstuvwxyz\n# comment\n\n",
            stdin_is_tty=False,
        )
        code = run_cli(["--offline", "--stdin"], io)
        assert code == 0


class TestEnv:
    def test_env_discovers_keys(self):
        io, out, _ = _make_io(
            env={"ANTHROPIC_API_KEY": "sk-ant-abcdefghijklmnopqrstuvwxyz"},
        )
        code = run_cli(["--offline", "--env"], io)
        assert code == 0

    def test_env_with_no_keys_errors(self):
        io, _, err = _make_io(env={})
        code = run_cli(["--offline", "--env"], io)
        assert code == 1


class TestScan:
    def test_scan_offline_finds_keys(self):
        content = (
            "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n"
            "ANTHROPIC_API_KEY=sk-ant-abcdefghijklmnopqrstuvwxyz\n"
            "FOO=bar\n"
        )
        io, out, _ = _make_io(files={"/tmp/test.env": content})
        code = run_cli(["scan", "/tmp/test.env", "--offline"], io)
        assert code == 0
        joined = "\n".join(out)
        assert "OPENAI_API_KEY" in joined
        assert "ANTHROPIC_API_KEY" in joined

    def test_scan_missing_file_errors(self):
        io, _, err = _make_io()
        code = run_cli(["scan", "/tmp/does-not-exist.env"], io)
        assert code == 1

    def test_scan_json_output(self):
        content = "OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789\n"
        io, out, _ = _make_io(files={"/tmp/test.env": content})
        code = run_cli(["scan", "/tmp/test.env", "--offline", "--json"], io)
        assert code == 0
        payload = json.loads(out[0])
        assert payload[0]["name"] == "OPENAI_API_KEY"
        assert payload[0]["valid"] is True


class TestMaskKey:
    def test_long_key_masking(self):
        assert mask_key("sk-1234567890abcdef") == "sk-1234...cdef"

    def test_short_key_masking(self):
        assert mask_key("short") == "sh...rt"
