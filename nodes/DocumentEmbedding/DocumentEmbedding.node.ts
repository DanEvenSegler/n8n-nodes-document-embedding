import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

interface IEmbeddingModel {
	embedQuery(text: string): Promise<number[]>;
	embedDocuments(texts: string[]): Promise<number[][]>;
}

interface ITextSplitter {
	splitText?(text: string): Promise<string[]>;
	splitDocuments?(documents: Array<{ pageContent: string; metadata: Record<string, unknown> }>): Promise<Array<{ pageContent: string }>>;
}

function getNestedValue(obj: unknown, path: string): unknown {
	if (!path) return undefined;
	let current: unknown = obj;
	for (const part of path.split('.')) {
		if (current && typeof current === 'object' && part in current) {
			current = (current as Record<string, unknown>)[part];
		} else {
			return undefined;
		}
	}
	return current;
}

export class DocumentEmbedding implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Document Embedding',
		name: 'documentEmbedding',
		icon: {
			light: 'file:../../icons/document-embedding.svg',
			dark: 'file:../../icons/document-embedding.dark.svg',
		},
		group: ['transform'],
		version: 1,
		description: 'Vectorize / Embed documents and JSON data fields',
		subtitle: '={{$parameter.mode === "specificField" ? "Field: " + $parameter.fieldName : "All Data"}}',
		usableAsTool: true,
		defaults: {
			name: 'Document Embedding',
		},
		inputs: `={{ ((parameters) => {
			const inputs = [
				"${NodeConnectionTypes.Main}",
				{
					displayName: 'Embedding Model',
					maxConnections: 1,
					type: "${NodeConnectionTypes.AiEmbedding}",
					required: true,
				},
			];
			if (parameters?.chunking) {
				inputs.push({
					displayName: 'Text Splitter',
					maxConnections: 1,
					type: "${NodeConnectionTypes.AiTextSplitter}",
					required: true,
				});
			}
			return inputs;
		})($parameter) }}`,
		outputs: [NodeConnectionTypes.Main],
		properties: [
			{
				displayName: 'Data Mode',
				name: 'mode',
				type: 'options',
				options: [
					{
						name: 'All Data (Stringify Whole Item)',
						value: 'allData',
					},
					{
						name: 'Specific Field',
						value: 'specificField',
					},
				],
				default: 'specificField',
				description: 'Whether to embed the entire input item as a JSON string, or just a specific text field',
			},
			{
				displayName: 'Field Name',
				name: 'fieldName',
				type: 'string',
				default: 'text',
				displayOptions: {
					show: {
						mode: ['specificField'],
					},
				},
				description: 'The name of the field to embed. Supports dot notation for nested fields (e.g., message.content).',
			},
			{
				displayName: 'Split / Chunk Text',
				name: 'chunking',
				type: 'boolean',
				default: false,
				description: 'Whether to split the text into smaller chunks using a text splitter subnode before embedding',
			},
			{
				displayName: 'Output Mode',
				name: 'outputMode',
				type: 'options',
				options: [
					{
						name: 'Append to Input Items',
						value: 'append',
						description: 'Add the embeddings and chunks as a new property on each input item',
					},
					{
						name: 'Output New Items',
						value: 'newItems',
						description: 'Output a clean list of new items (one item per chunk, or one item per original document)',
					},
				],
				default: 'append',
				description: 'How the result should be returned',
			},
			{
				displayName: 'Output Property Name',
				name: 'outputPropertyName',
				type: 'string',
				default: 'embedding',
				displayOptions: {
					show: {
						outputMode: ['append'],
					},
				},
				description: 'The property name to save the embedding or chunk array into',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const mode = this.getNodeParameter('mode', 0, 'specificField') as string;
		const fieldName = this.getNodeParameter('fieldName', 0, 'text') as string;
		const chunking = this.getNodeParameter('chunking', 0, false) as boolean;
		const outputMode = this.getNodeParameter('outputMode', 0, 'append') as string;
		const outputPropertyName = this.getNodeParameter('outputPropertyName', 0, 'embedding') as string;

		// 1. Get Connected Embedding Model
		const embeddingModel = (await this.getInputConnectionData(NodeConnectionTypes.AiEmbedding, 0)) as unknown as IEmbeddingModel;
		if (!embeddingModel) {
			throw new NodeOperationError(this.getNode(), 'No embedding model is connected! Please connect an embedding provider (e.g. OpenAI or Ollama Embeddings).');
		}

		// 2. Get Connected Text Splitter (if chunking is enabled)
		let textSplitter: ITextSplitter | null = null;
		if (chunking) {
			textSplitter = (await this.getInputConnectionData(NodeConnectionTypes.AiTextSplitter, 0)) as unknown as ITextSplitter;
			if (!textSplitter) {
				throw new NodeOperationError(this.getNode(), 'No Text Splitter is connected! When Split / Chunk Text is enabled, you must connect a Text Splitter subnode.');
			}
		}

		// Iterate through all input items
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const item = items[itemIndex];
				
				// Extract the text to embed
				let textToEmbed = '';
				if (mode === 'allData') {
					textToEmbed = JSON.stringify(item.json);
				} else {
					const rawValue = getNestedValue(item.json, fieldName);
					if (rawValue === undefined || rawValue === null) {
						textToEmbed = '';
					} else if (typeof rawValue === 'object') {
						textToEmbed = JSON.stringify(rawValue);
					} else {
						textToEmbed = String(rawValue);
					}
				}

				if (chunking && textSplitter) {
					// Split text into chunks
					let chunks: string[] = [];
					if (textToEmbed) {
						if (typeof textSplitter.splitText === 'function') {
							chunks = await textSplitter.splitText(textToEmbed);
						} else if (typeof textSplitter.splitDocuments === 'function') {
							const docs = await textSplitter.splitDocuments([{ pageContent: textToEmbed, metadata: {} }]);
							chunks = docs.map((doc) => doc.pageContent);
						} else {
							throw new NodeOperationError(
								this.getNode(),
								'The connected text splitter does not support standard splitting methods.',
								{ itemIndex }
							);
						}
					}

					// Embed each chunk
					let embeddings: number[][] = [];
					if (chunks.length > 0) {
						embeddings = await embeddingModel.embedDocuments(chunks);
					}

					const chunkObjects = chunks.map((chunk, idx) => ({
						text: chunk,
						embedding: embeddings[idx] || [],
					}));

					if (outputMode === 'append') {
						const newItem: INodeExecutionData = {
							json: {
								...item.json,
								[outputPropertyName]: chunkObjects,
							},
							pairedItem: itemIndex,
						};
						if (item.binary) {
							newItem.binary = item.binary;
						}
						returnData.push(newItem);
					} else {
						// Output multiple new items, one per chunk
						for (const chunkObj of chunkObjects) {
							returnData.push({
								json: chunkObj,
								pairedItem: itemIndex,
							});
						}
					}
				} else {
					// Embed the single text string
					let embedding: number[] = [];
					if (textToEmbed) {
						embedding = await embeddingModel.embedQuery(textToEmbed);
					}

					if (outputMode === 'append') {
						const newItem: INodeExecutionData = {
							json: {
								...item.json,
								[outputPropertyName]: embedding,
							},
							pairedItem: itemIndex,
						};
						if (item.binary) {
							newItem.binary = item.binary;
						}
						returnData.push(newItem);
					} else {
						// Output single new item
						returnData.push({
							json: {
								text: textToEmbed,
								embedding,
							},
							pairedItem: itemIndex,
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...items[itemIndex].json,
							error: (error as Error).message || error,
						},
						pairedItem: itemIndex,
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, {
						itemIndex,
					});
				}
			}
		}

		return [returnData];
	}
}
