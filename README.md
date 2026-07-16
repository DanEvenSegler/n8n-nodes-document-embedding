# n8n-nodes-document-embedding

An n8n community node that allows you to vectorize (embed) documents and data fields at any point in your workflow.

Unlike standard n8n vector store nodes that require direct database insertions, this node is designed to be **universal**: it takes any incoming JSON data, chunks it (optional), and calls a connected embedding model (such as OpenAI or Ollama Embeddings) to return raw vector embeddings directly into your workflow.

[![n8n community node](https://img.shields.io/badge/n8n-community--node-orange.svg)](https://docs.n8n.io/integrations/community-nodes/)
[![npm version](https://badge.fury.io/js/n8n-nodes-document-embedding.svg)](https://www.npmjs.com/package/n8n-nodes-document-embedding)

---

## Features

- **Universal Embedding Client**: Vectorize text data anywhere in your workflow.
- **Sub-node Connectors**: Connect any embedding model (e.g., OpenAI Embeddings, Ollama Embeddings) and character splitter (e.g., Recursive Character Text Splitter) from n8n's AI ecosystem.
- **Flexible Data Input**: Embed the entire incoming JSON item or specify a specific field (supports dot notation like `message.content`).
- **Optional Text Splitting / Chunking**: Automatically splits long texts into chunks using the connected text splitter and embeds each chunk in a batch.
- **Flexible Outputs**:
  - **Append to Input Items**: Adds a new property containing the vector array (or array of chunk objects) directly to the original item.
  - **Output New Items**: Returns a clean list of new items containing only the text and its corresponding embedding (e.g., one item per chunk).

---

## Installation

### Community Node Installation in n8n

1. Go to **Settings > Community Nodes** in your self-hosted n8n instance.
2. Click on **Install a node**.
3. Enter the npm package name: `n8n-nodes-document-embedding`.
4. Agree to the terms and click **Install**.

---

## Configuration & Usage

### 1. Node Connections
The node exposes the following connection ports:
- **Input (Main)**: The incoming data stream containing the text/JSON to vectorize.
- **Embedding Model (Sub-node, Required)**: Connect any compatible n8n Embedding model node (e.g. *Embeddings OpenAI*, *Embeddings Ollama*).
- **Text Splitter (Sub-node, Optional)**: Appears only when **Split / Chunk Text** is enabled. Connect any compatible n8n Text Splitter node (e.g. *Recursive Character Text Splitter*).

### 2. Properties & Parameters
- **Data Mode**:
  - `Specific Field`: Embeds a single specific field (supports dot notation like `message.content`).
  - `Multiple Fields`: Embeds multiple specified fields (comma-separated list) joined together.
  - `All Data`: Stringifies the entire incoming item's JSON data.
  - `Custom JSON`: Define a custom JSON object to embed using a code editor.
  - `Custom String Template`: Define a custom text string with expressions (e.g. `Hello {{ $json.name }}, this is text.`).
- **Fields List**: Comma-separated list of fields to include (visible in `Multiple Fields` mode).
- **Custom JSON / Custom String**: The editor input fields (visible in their respective modes).
- **JSON Formatting**:
  - `Key-Value Pairs (Comma Separated)` (Default): Formats as `key1: value1, key2: value2`.
  - `Key-Value Pairs (Newlines)`: Formats as `key1: value1\nkey2: value2`.
  - `JSON String`: Formats as standard stringified JSON `{"key1":"value1","key2":"value2"}`.
- **Split / Chunk Text**: Enable this to show the Text Splitter sub-node input and split the text into chunks before embedding.
- **Preserve Original Fields**:
  - `All Original Fields` (Default): Carries over all original properties of the input item into the output objects.
  - `Specific Fields Only`: Preserves only a specified list of fields (comma-separated list).
  - `None (Clean Output)`: Outputs only the embedded text and the embedding vector.
- **Output Mode**:
  - `Append to Input Items`: Modifies the incoming items to add the embedding results under a custom property name.
  - `Output New Items`: Generates clean, new JSON objects (either one item per chunk, or one item per original document).
- **Output Property Name**: The key under which the embedding vector array or chunks array will be saved.
- **Output Text Property Name**: The key under which the text content will be saved (defaults to `text`).

---

## Output Examples

### Mode: Non-Chunked (Append Mode with All Original Fields)
```json
{
  "id": 123,
  "text": "Hello world",
  "category": "news",
  "embedding": [
    0.002394028,
    -0.012304918,
    0.082390184,
    ...
  ]
}
```

### Mode: Chunked (New Items Mode with Specific Fields Preserved: `id`)
When **Split / Chunk Text** is enabled and **Preserve Original Fields** is set to `specific` with `id`, the output returns multiple clean items representing chunks:
```json
[
  {
    "id": 123,
    "text": "First chunk text...",
    "embedding": [0.012, -0.054, 0.089, ...]
  },
  {
    "id": 123,
    "text": "Second chunk text...",
    "embedding": [0.003, 0.021, -0.041, ...]
  }
]
```


---

## License

[MIT](LICENSE.md)
