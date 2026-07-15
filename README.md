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
  - `Specific Field` (Default): Embeds a specific field of the incoming JSON.
  - `All Data`: Stringifies the entire incoming item's JSON and embeds it.
- **Field Name**: The dot-notation path of the field to embed (e.g. `text` or `data.description`). Visible only in `Specific Field` mode.
- **Split / Chunk Text**: Enable this to show the Text Splitter sub-node input and split the text into chunks before embedding.
- **Output Mode**:
  - `Append to Input Items`: Modifies the incoming items to add the embedding results under a custom property name.
  - `Output New Items`: Generates clean, new JSON objects with only the text and embedding keys.
- **Output Property Name**: The key under which the embedding results will be saved (visible in `Append` mode).

---

## Output Examples

### Mode: Non-Chunked (Append Mode)
```json
{
  "id": 123,
  "text": "Hello world",
  "embedding": [
    0.002394028,
    -0.012304918,
    0.082390184,
    ...
  ]
}
```

### Mode: Chunked (Append Mode)
When **Split / Chunk Text** is enabled, the output property contains an array of chunk objects:
```json
{
  "id": 123,
  "text": "Long document text...",
  "embedding": [
    {
      "text": "Long document",
      "embedding": [0.012, -0.054, 0.089, ...]
    },
    {
      "text": "text...",
      "embedding": [0.003, 0.021, -0.041, ...]
    }
  ]
}
```

---

## License

[MIT](LICENSE.md)

## Author

- **Author**: Dan Even Segler
- **Email**: [danevensegler08@gmail.com](mailto:danevensegler08@gmail.com)
- **Repository**: [https://github.com/DanEvenSegler/n8n-nodes-document-embedding](https://github.com/DanEvenSegler/n8n-nodes-document-embedding)
