import os
import re
import shutil
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path


NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


# Use digit-boundaries instead of word-boundaries because docs often glue text (ex.: "...CNPJ: 12.345...-90CONTRATO")
CPF_FMT = re.compile(r"(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)")
CNPJ_FMT = re.compile(r"(?<!\d)\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}(?!\d)")
CEP_FMT = re.compile(r"(?<!\d)\d{5}-\d{3}(?!\d)")
PHONE_FMT = re.compile(r"(?<!\d)\(?\d{2}\)?\s?\d{4,5}-\d{4}(?!\d)")

CPF_RAW = re.compile(r"\b\d{11}\b")
CNPJ_RAW = re.compile(r"\b\d{14}\b")


def sanitize_paragraph_text(text: str) -> str:
    if not text:
        return text

    # Always safe replacements (formatted values only)
    text = CPF_FMT.sub("{{CPF}}", text)
    text = CNPJ_FMT.sub("{{CNPJ}}", text)
    text = CEP_FMT.sub("{{CEP}}", text)
    text = PHONE_FMT.sub("{{TELEFONE}}", text)

    # Context-based replacements for raw digits (avoid false positives)
    upper = text.upper()
    has_context_cpf = (" CPF" in upper) or ("CPF:" in upper) or ("CPF/" in upper) or ("CPF " in upper)
    has_context_cnpj = (" CNPJ" in upper) or ("CNPJ:" in upper) or ("CNPJ/" in upper) or ("CNPJ " in upper) or ("CNPJ/MF" in upper)

    if has_context_cpf or "CNPJ/MF" in upper:
        text = CPF_RAW.sub("{{CPF}}", text)
    if has_context_cnpj or "CNPJ/MF" in upper:
        text = CNPJ_RAW.sub("{{CNPJ}}", text)

    return text


def sanitize_xml_bytes(xml_bytes: bytes) -> bytes:
    root = ET.fromstring(xml_bytes)

    # Iterate paragraphs; sanitize each text run inside.
    for p in root.findall(".//w:p", NS):
        ts = [t for t in p.findall(".//w:t", NS)]
        if not ts:
            continue

        # Paragraph text for context
        paragraph_text = "".join([t.text or "" for t in ts])
        sanitized_paragraph = sanitize_paragraph_text(paragraph_text)

        if sanitized_paragraph == paragraph_text:
            continue

        # Simple strategy: replace per-run by applying sanitize on each run (keeps structure)
        for t in ts:
            if not t.text:
                continue
            t.text = sanitize_paragraph_text(t.text)

    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def sanitize_docx(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        dst.unlink()

    with zipfile.ZipFile(src, "r") as zin:
        with zipfile.ZipFile(dst, "w", compression=zipfile.ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if info.filename.startswith("word/") and info.filename.endswith(".xml"):
                    # Only attempt to parse WordprocessingML files.
                    try:
                        data = sanitize_xml_bytes(data)
                    except Exception:
                        # If parsing fails, keep original.
                        pass
                zout.writestr(info, data)


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    out_dir = repo_root / "templates" / "doc-modelos"
    out_dir.mkdir(parents=True, exist_ok=True)

    sources = [
        Path("/Users/vitormaria/Desktop/ANEXO I DOMICILIO FISCAL (1).docx"),
        Path("/Users/vitormaria/Desktop/ANEXO II DOMICILIO FISCAL.docx"),
        Path("/Users/vitormaria/Desktop/CONTRATO-DE-ADESAO-AO-SERVICO-DE-ENDERECO-FISCAL (1).docx"),
        Path("/Users/vitormaria/Desktop/Cópia de REQUERIMENTO PREFEITURA GAROPABA.docx"),
        Path("/Users/vitormaria/Desktop/INFORMACOES INICIAIS.docx"),
        Path("/Users/vitormaria/Desktop/ALTERAÇÃO CONTRATUAL DE TRANSFORMAÇÃO EM EMPRESÁRIO INDIVIDUAL.docx"),
        Path(
            "/Users/vitormaria/Desktop/ALTERAÇÃO_POR_TRANSFORMAÇÃO_DO_INSTRUMENTO_DE_INSCRIÇÃO_DE_EMPRESÁRIO_INDIVIDUAL_EM_SOCIEDADE_LIMITADA_UNIPESSOAL[1].docx"
        ),
    ]

    rename = {
        "ANEXO I DOMICILIO FISCAL (1).docx": "ANEXO I DOMICILIO FISCAL - MODELO.docx",
        "ANEXO II DOMICILIO FISCAL.docx": "ANEXO II DOMICILIO FISCAL - MODELO.docx",
        "CONTRATO-DE-ADESAO-AO-SERVICO-DE-ENDERECO-FISCAL (1).docx": "CONTRATO DE ADESAO AO SERVICO DE ENDERECO FISCAL - MODELO.docx",
        "Cópia de REQUERIMENTO PREFEITURA GAROPABA.docx": "REQUERIMENTO PREFEITURA GAROPABA - MODELO.docx",
        "INFORMACOES INICIAIS.docx": "INFORMACOES INICIAIS - MODELO.docx",
        "ALTERAÇÃO CONTRATUAL DE TRANSFORMAÇÃO EM EMPRESÁRIO INDIVIDUAL.docx": "ALTERACAO CONTRATUAL TRANSFORMACAO EM EMPRESARIO INDIVIDUAL - MODELO.docx",
        "ALTERAÇÃO_POR_TRANSFORMAÇÃO_DO_INSTRUMENTO_DE_INSCRIÇÃO_DE_EMPRESÁRIO_INDIVIDUAL_EM_SOCIEDADE_LIMITADA_UNIPESSOAL[1].docx": "ALTERACAO POR TRANSFORMACAO EM LTDA UNIPESSOAL - MODELO.docx",
    }

    missing = [str(p) for p in sources if not p.exists()]
    if missing:
        raise SystemExit(f"Arquivos não encontrados: {missing}")

    for src in sources:
        dst = out_dir / rename.get(src.name, f"{src.stem} - MODELO{src.suffix}")
        sanitize_docx(src, dst)


if __name__ == "__main__":
    main()
