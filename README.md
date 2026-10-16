# Crystal RAG

Local retrieval over a folder you already have. The app draws the files as a 3D crystal, embeds the text on the machine, and answers from those passages. Qdrant and the embedding model are inside the download. No account. Nothing leaves the machine unless you add an endpoint yourself.

MIT. Not notarized.

## Download

[Apple Silicon](https://github.com/misomalcek/crystal-rag/releases/download/v0.4.10/crystal-rag_0.4.10_aarch64.dmg) · [Windows x64](https://github.com/misomalcek/crystal-rag/releases/download/v0.4.10/crystal-rag_0.4.10_x64-setup.exe) · [0.4.10](https://github.com/misomalcek/crystal-rag/releases/tag/v0.4.10)

macOS, first launch: right-click the app, then Open. Windows: More info, then Run anyway. The installed app is about 188 MB. No Docker, Node, or Python.

## What it is for

A folder of notes, or a small repository. Markdown, text, HTML, source, and the text layer of a PDF. You click a name and see where it lives, or you ask a question and the answer has to come from those files.

A small model is enough. A free-tier model around a few billion parameters answered from the retrieved passages on the first try. The app is not for a huge codebase. Ingest stops at 400 chunks and the log says so.

## What you are looking at

Files, imports, and names are nodes. The same spelling in two files is one node. Click it for the passages, the neighbors, and a bridge score next to how many links it has.

Retrieve fuses three lists by rank, reciprocal rank fusion, k = 60: the embedding, a word search (BM25), and a walk along names that share a passage. Fusion reads rank. It does not mix in the cosine or the edge weight.

Hop and Blast are buttons on the crystal. One step from the node you clicked, or two.

Ask sends those retrieved passages to your endpoint in one call. The model does not receive tools. An OpenAI-compatible URL works, cloud or local, including a gateway in front of it. A rate limit comes back as one sentence. Without an endpoint, the crystal and retrieve still run. A key, if the server wants one, stays in the app settings. It is not in the download.

## Stack

Tauri 2, Rust, Vite, three.js. nomic-embed-text v1.5, 768 dimensions, served by llama.cpp. Qdrant holds the vectors. Ports are chosen when the app starts.

The third list is the Zep / Graphiti idea: the graph produces a ranking, then RRF. This build stops at that fusion. It does not add their later MMR or node-distance stages.

## Limits

| | |
|---|---|
| Chunks | 400 for the folder, 80 for one file, about 1 800 characters each |
| Drawn | 400 file nodes. 10 000 files walked |
| Files | text and source as listed below; one PDF up to 32 MB, text layer only |
| Skipped | `node_modules`, `target`, `dist`, `.git`, hidden directories, names ending in `_files` |
| Not read | images are nodes, no OCR. Office files are counted, not parsed |

Read as text: `md txt html htm`, `rs ts tsx js jsx mjs cjs py go java c h cpp cc hpp`, `pdf`.

## Build

```bash
npm install
CI=true npx tauri build --bundles app
hdiutil create -volname "Crystal RAG" \
  -srcfolder "src-tauri/target/release/bundle/macos/Crystal RAG.app" \
  -ov -format UDZO src-tauri/target/release/bundle/dmg/crystal-rag_0.4.10_aarch64.dmg
```

`tauri build --bundles dmg` has packed a thin image that omitted Qdrant and nomic. Build the app, then wrap it. Apple Silicon. Windows is the GitHub Actions workflow, started by hand.
