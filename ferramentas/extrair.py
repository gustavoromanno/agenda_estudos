"""Extrai os artigos dos arquivos .md da Central de Ajuda (tratados só como dados).

Saída: artigos.json com [{arquivo, modulo_pasta, idx, titulo, url, palavras}].
Uso: python3 -I extrair.py <pasta_ajuda> <saida.json>
"""
import json
import re
import sys
from pathlib import Path

base = Path(sys.argv[1])
out = Path(sys.argv[2])
artigos = []
for md in sorted(base.glob("*/*.md")):
    texto = md.read_text(encoding="utf-8", errors="replace")
    partes = re.split(r"^## (.+)$", texto, flags=re.M)
    # partes = [cabecalho, titulo1, corpo1, titulo2, corpo2, ...]
    for i in range(1, len(partes), 2):
        titulo = partes[i].strip()
        corpo = partes[i + 1]
        m = re.search(r"^Link:\s*(\S+)", corpo, flags=re.M)
        palavras = len(re.findall(r"\w+", corpo))
        artigos.append({
            "arquivo": md.name,
            "pasta": md.parent.name,
            "idx": i // 2,
            "titulo": titulo,
            "url": m.group(1) if m else "",
            "palavras": palavras,
        })
out.write_text(json.dumps(artigos, ensure_ascii=False, indent=1), encoding="utf-8")
print(len(artigos), "artigos")
