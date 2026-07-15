import type {
	IDataObject,
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

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
	const parts = path.split('.');
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] === undefined || typeof current[part] !== 'object') {
			current[part] = {};
		}
		current = current[part] as Record<string, unknown>;
	}
	current[parts[parts.length - 1]] = value;
}

function formatObject(obj: unknown, format: string, keysToInclude?: string[]): string {
	if (!obj || typeof obj !== 'object') {
		return String(obj);
	}

	let data = obj as Record<string, unknown>;
	if (keysToInclude && keysToInclude.length > 0) {
		const filtered: Record<string, unknown> = {};
		for (const key of keysToInclude) {
			const trimmedKey = key.trim();
			const val = getNestedValue(obj, trimmedKey);
			if (val !== undefined) {
				filtered[trimmedKey] = val;
			}
		}
		data = filtered;
	}

	if (format === 'json') {
		return JSON.stringify(data);
	}

	// Format as key-value pairs
	const entries = Object.entries(data).map(([key, val]) => {
		const valStr = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
		return `${key}: ${valStr}`;
	});

	if (format === 'keyValueNewlines') {
		return entries.join('\n');
	}

	return entries.join(', ');
}

function getPreservedFields(originalJson: Record<string, unknown>, keepMode: string, specificFieldsStr: string): Record<string, unknown> {
	if (keepMode === 'none') {
		return {};
	}
	if (keepMode === 'all') {
		return { ...originalJson };
	}

	const result: Record<string, unknown> = {};
	const fields = specificFieldsStr.split(',');
	for (const field of fields) {
		const trimmedField = field.trim();
		const val = getNestedValue(originalJson, trimmedField);
		if (val !== undefined) {
			setNestedValue(result, trimmedField, val);
		}
	}
	return result;
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
		subtitle: '={{$parameter.mode === "specificField" ? "Field: " + $parameter.fieldName : ($parameter.mode === "multipleFields" ? "Fields: " + $parameter.fieldsList : "Mode: " + $parameter.mode)}}',
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
						description: 'Embed the entire input item formatted as a string',
					},
					{
						name: 'Custom JSON',
						value: 'customJson',
						description: 'Embed a custom JSON object defined via code editor',
					},
					{
						name: 'Custom String Template',
						value: 'customString',
						description: 'Embed a custom string template containing expressions',
					},
					{
						name: 'Multiple Fields',
						value: 'multipleFields',
						description: 'Embed multiple specified fields joined together',
					},
					{
						name: 'Specific Field',
						value: 'specificField',
						description: 'Embed a single specific field of the input item',
					},
				],
				default: 'specificField',
				description: 'How to extract and format the text content to embed',
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
				displayName: 'Fields List',
				name: 'fieldsList',
				type: 'string',
				default: 'title, description',
				displayOptions: {
					show: {
						mode: ['multipleFields'],
					},
				},
				description: 'Comma-separated list of fields to include (e.g. title, description)',
			},
			{
				displayName: 'Custom JSON',
				name: 'customJsonInput',
				type: 'json',
				default: '{\n  "text": ""\n}',
				typeOptions: {
					alwaysOpenEditWindow: true,
				},
				displayOptions: {
					show: {
						mode: ['customJson'],
					},
				},
				description: 'Define a custom JSON object to embed',
			},
			{
				displayName: 'Custom String',
				name: 'customStringInput',
				type: 'string',
				default: '',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						mode: ['customString'],
					},
				},
				description: 'Define a custom text string to embed, with optional expressions',
			},
			{
				displayName: 'JSON Formatting',
				name: 'jsonFormatting',
				type: 'options',
				options: [
					{
						name: 'JSON String',
						value: 'json',
						description: 'Format as a standard stringified JSON object',
					},
					{
						name: 'Key-Value Pairs (Comma Separated)',
						value: 'keyValuePairs',
						description: 'Format as "key1: value1, key2: value2"',
					},
					{
						name: 'Key-Value Pairs (Newlines)',
						value: 'keyValueNewlines',
						description: 'Format as "key1: value1\\nkey2: value2"',
					},
				],
				default: 'keyValuePairs',
				displayOptions: {
					show: {
						mode: ['allData', 'specificField', 'multipleFields', 'customJson'],
					},
				},
				description: 'How the object data should be stringified before embedding',
			},
			{
				displayName: 'Split / Chunk Text',
				name: 'chunking',
				type: 'boolean',
				default: false,
				description: 'Whether to split the text into smaller chunks using a text splitter subnode before embedding',
			},
			{
				displayName: 'Preserve Original Fields',
				name: 'keepFields',
				type: 'options',
				options: [
					{
						name: 'All Original Fields',
						value: 'all',
					},
					{
						name: 'None (Clean Output)',
						value: 'none',
					},
					{
						name: 'Specific Fields Only',
						value: 'specific',
					},
				],
				default: 'all',
				description: 'Which fields from the original input item to carry over into the output objects',
			},
			{
				displayName: 'Fields to Keep',
				name: 'fieldsToPreserve',
				type: 'string',
				default: 'id',
				displayOptions: {
					show: {
						keepFields: ['specific'],
					},
				},
				description: 'Comma-separated list of fields to preserve (e.g. ID, metadata.source)',
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
				description: 'The property name to save the embedding or chunks list. Used as the key name for the vector array.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// 1. Get Connected Embedding Model
		const embeddingModel = (await this.getInputConnectionData(NodeConnectionTypes.AiEmbedding, 0)) as unknown as IEmbeddingModel;
		if (!embeddingModel) {
			throw new NodeOperationError(this.getNode(), 'No embedding model is connected! Please connect an embedding provider (e.g. OpenAI or Ollama Embeddings).');
		}

		// 2. Get Connected Text Splitter (if chunking is enabled)
		let textSplitter: ITextSplitter | null = null;
		try {
			textSplitter = (await this.getInputConnectionData(NodeConnectionTypes.AiTextSplitter, 0)) as unknown as ITextSplitter;
		} catch {
			// Ignore if not connected (will be validated inside the loop if chunking is true)
		}

		// Iterate through all input items
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const item = items[itemIndex];

				const mode = this.getNodeParameter('mode', itemIndex, 'specificField') as string;
				const fieldName = this.getNodeParameter('fieldName', itemIndex, 'text') as string;
				const fieldsList = this.getNodeParameter('fieldsList', itemIndex, '') as string;
				const customJsonInput = this.getNodeParameter('customJsonInput', itemIndex, '{}');
				const customStringInput = this.getNodeParameter('customStringInput', itemIndex, '') as string;
				const jsonFormatting = this.getNodeParameter('jsonFormatting', itemIndex, 'keyValuePairs') as string;
				const chunking = this.getNodeParameter('chunking', itemIndex, false) as boolean;
				const keepFields = this.getNodeParameter('keepFields', itemIndex, 'all') as string;
				const fieldsToPreserve = this.getNodeParameter('fieldsToPreserve', itemIndex, '') as string;
				const outputMode = this.getNodeParameter('outputMode', itemIndex, 'append') as string;
				const outputPropertyName = this.getNodeParameter('outputPropertyName', itemIndex, 'embedding') as string;
				
				// Extract the text to embed
				let textToEmbed = '';
				if (mode === 'allData') {
					textToEmbed = formatObject(item.json, jsonFormatting);
				} else if (mode === 'multipleFields') {
					const keys = fieldsList.split(',').map(k => k.trim()).filter(Boolean);
					textToEmbed = formatObject(item.json, jsonFormatting, keys);
				} else if (mode === 'customJson') {
					let jsonObject: unknown;
					try {
						jsonObject = typeof customJsonInput === 'string' ? JSON.parse(customJsonInput) : customJsonInput;
					} catch {
						throw new NodeOperationError(this.getNode(), 'Invalid JSON input in Custom JSON field', { itemIndex });
					}
					textToEmbed = formatObject(jsonObject, jsonFormatting);
				} else if (mode === 'customString') {
					textToEmbed = customStringInput;
				} else {
					// specificField
					const rawValue = getNestedValue(item.json, fieldName);
					if (rawValue === undefined || rawValue === null) {
						textToEmbed = '';
					} else if (typeof rawValue === 'object') {
						textToEmbed = formatObject(rawValue, jsonFormatting);
					} else {
						textToEmbed = String(rawValue);
					}
				}

				// Resolve fields we wish to preserve in output
				const preserved = getPreservedFields(item.json as Record<string, unknown>, keepFields, fieldsToPreserve);

				if (chunking) {
					if (!textSplitter) {
						throw new NodeOperationError(this.getNode(), 'No Text Splitter is connected! When Split / Chunk Text is enabled, you must connect a Text Splitter subnode.', { itemIndex });
					}

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
						...preserved,
						text: chunk,
						[outputPropertyName]: embeddings[idx] || [],
					} as IDataObject));

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
								...preserved,
								text: textToEmbed,
								[outputPropertyName]: embedding,
							} as IDataObject,
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
