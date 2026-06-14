from __future__ import annotations

from llm_key_validator.core.scan import parse_env_file


def test_basic_extraction():
    content = "OPENAI_API_KEY=sk-abc\nFOO=bar\n"
    entries = parse_env_file(content)
    assert len(entries) == 1
    assert entries[0].name == "OPENAI_API_KEY"
    assert entries[0].value == "sk-abc"
    assert entries[0].line_number == 1


def test_suffix_matching():
    content = "FOO_API_KEY=a\nFOO_KEY=b\nFOO_TOKEN=c\nFOO_SECRET=d\nFOO_OTHER=e\n"
    entries = parse_env_file(content)
    names = [e.name for e in entries]
    assert names == ["FOO_API_KEY", "FOO_KEY", "FOO_TOKEN", "FOO_SECRET"]


def test_export_prefix_stripped():
    content = "export OPENAI_API_KEY=sk-foo\n"
    entries = parse_env_file(content)
    assert len(entries) == 1
    assert entries[0].name == "OPENAI_API_KEY"
    assert entries[0].value == "sk-foo"


def test_quotes_stripped():
    content = "OPENAI_API_KEY=\"sk-foo\"\nANTHROPIC_API_KEY='sk-ant-bar'\n"
    entries = parse_env_file(content)
    values = [e.value for e in entries]
    assert "sk-foo" in values
    assert "sk-ant-bar" in values


def test_inline_comment_stripped():
    content = "OPENAI_API_KEY=sk-foo # this is my key\n"
    entries = parse_env_file(content)
    assert entries[0].value == "sk-foo"


def test_placeholder_filtered():
    content = (
        "A_API_KEY=changeme\n"
        "B_API_KEY=your-api-key\n"
        "C_API_KEY=YOUR_KEY_HERE\n"
        "D_API_KEY=xxxxx\n"
        "E_API_KEY=...\n"
        "F_API_KEY=TODO\n"
        "G_API_KEY=placeholder\n"
        "H_API_KEY=<your-key>\n"
        "I_API_KEY=\n"
        "J_API_KEY=real-value-here\n"
    )
    entries = parse_env_file(content)
    names = [e.name for e in entries]
    assert names == ["J_API_KEY"]


def test_lowercase_names_skipped():
    content = "openai_api_key=sk-foo\n"
    entries = parse_env_file(content)
    assert entries == []


def test_comment_lines_skipped():
    content = "# OPENAI_API_KEY=sk-foo\nOPENAI_API_KEY=sk-bar\n"
    entries = parse_env_file(content)
    assert len(entries) == 1
    assert entries[0].line_number == 2


def test_crlf_line_endings():
    content = "OPENAI_API_KEY=sk-foo\r\nANTHROPIC_API_KEY=sk-ant-bar\r\n"
    entries = parse_env_file(content)
    assert len(entries) == 2
