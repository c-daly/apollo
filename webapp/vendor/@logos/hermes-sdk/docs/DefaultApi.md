# DefaultApi

All URIs are relative to *http://localhost:8080*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**embedText**](DefaultApi.md#embedtextoperation) | **POST** /embed_text | Text Embedding Generation |
| [**llmGenerate**](DefaultApi.md#llmgenerate) | **POST** /llm | LLM Gateway |
| [**simpleNlp**](DefaultApi.md#simplenlpoperation) | **POST** /simple_nlp | Simple NLP Preprocessing |
| [**speechToText**](DefaultApi.md#speechtotext) | **POST** /stt | Speech-to-Text |
| [**textToSpeech**](DefaultApi.md#texttospeechoperation) | **POST** /tts | Text-to-Speech |



## embedText

> EmbedText200Response embedText(embedTextRequest)

Text Embedding Generation

Generate vector embeddings for input text

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '@logos/hermes-sdk';
import type { EmbedTextOperationRequest } from '@logos/hermes-sdk';

async function example() {
  console.log("🚀 Testing @logos/hermes-sdk SDK...");
  const api = new DefaultApi();

  const body = {
    // EmbedTextRequest
    embedTextRequest: ...,
  } satisfies EmbedTextOperationRequest;

  try {
    const data = await api.embedText(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **embedTextRequest** | [EmbedTextRequest](EmbedTextRequest.md) |  | |

### Return type

[**EmbedText200Response**](EmbedText200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Embedding generation successful |  -  |
| **400** | Invalid request |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## llmGenerate

> LLMResponse llmGenerate(lLMRequest)

LLM Gateway

Proxy chat/completion requests through the configured provider (OpenAI, local, or echo fallback).

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '@logos/hermes-sdk';
import type { LlmGenerateRequest } from '@logos/hermes-sdk';

async function example() {
  console.log("🚀 Testing @logos/hermes-sdk SDK...");
  const api = new DefaultApi();

  const body = {
    // LLMRequest
    lLMRequest: ...,
  } satisfies LlmGenerateRequest;

  try {
    const data = await api.llmGenerate(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **lLMRequest** | [LLMRequest](LLMRequest.md) |  | |

### Return type

[**LLMResponse**](LLMResponse.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Completion generated successfully |  -  |
| **400** | Invalid request (missing prompt/messages or schema violation) |  -  |
| **502** | Provider returned an error response |  -  |
| **503** | Provider not configured/available |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## simpleNlp

> SimpleNlp200Response simpleNlp(simpleNlpRequest)

Simple NLP Preprocessing

Perform basic NLP preprocessing (tokenization, POS tagging, etc.)

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '@logos/hermes-sdk';
import type { SimpleNlpOperationRequest } from '@logos/hermes-sdk';

async function example() {
  console.log("🚀 Testing @logos/hermes-sdk SDK...");
  const api = new DefaultApi();

  const body = {
    // SimpleNlpRequest
    simpleNlpRequest: ...,
  } satisfies SimpleNlpOperationRequest;

  try {
    const data = await api.simpleNlp(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **simpleNlpRequest** | [SimpleNlpRequest](SimpleNlpRequest.md) |  | |

### Return type

[**SimpleNlp200Response**](SimpleNlp200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | NLP processing successful |  -  |
| **400** | Invalid request |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## speechToText

> SpeechToText200Response speechToText(audio, language)

Speech-to-Text

Convert audio input to text transcription

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '@logos/hermes-sdk';
import type { SpeechToTextRequest } from '@logos/hermes-sdk';

async function example() {
  console.log("🚀 Testing @logos/hermes-sdk SDK...");
  const api = new DefaultApi();

  const body = {
    // Blob | Audio file to transcribe
    audio: BINARY_DATA_HERE,
    // string | Optional language hint (e.g., \\\"en-US\\\") (optional)
    language: language_example,
  } satisfies SpeechToTextRequest;

  try {
    const data = await api.speechToText(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **audio** | `Blob` | Audio file to transcribe | [Defaults to `undefined`] |
| **language** | `string` | Optional language hint (e.g., \\\&quot;en-US\\\&quot;) | [Optional] [Defaults to `&#39;en-US&#39;`] |

### Return type

[**SpeechToText200Response**](SpeechToText200Response.md)

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `multipart/form-data`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Transcription successful |  -  |
| **400** | Invalid request (e.g., unsupported audio format) |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## textToSpeech

> Blob textToSpeech(textToSpeechRequest)

Text-to-Speech

Convert text to synthesized speech audio

### Example

```ts
import {
  Configuration,
  DefaultApi,
} from '@logos/hermes-sdk';
import type { TextToSpeechOperationRequest } from '@logos/hermes-sdk';

async function example() {
  console.log("🚀 Testing @logos/hermes-sdk SDK...");
  const api = new DefaultApi();

  const body = {
    // TextToSpeechRequest
    textToSpeechRequest: ...,
  } satisfies TextToSpeechOperationRequest;

  try {
    const data = await api.textToSpeech(body);
    console.log(data);
  } catch (error) {
    console.error(error);
  }
}

// Run the test
example().catch(console.error);
```

### Parameters


| Name | Type | Description  | Notes |
|------------- | ------------- | ------------- | -------------|
| **textToSpeechRequest** | [TextToSpeechRequest](TextToSpeechRequest.md) |  | |

### Return type

**Blob**

### Authorization

No authorization required

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `audio/wav`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Speech synthesis successful |  -  |
| **400** | Invalid request |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

