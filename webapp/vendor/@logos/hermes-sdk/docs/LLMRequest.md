
# LLMRequest

Request payload for Hermes LLM gateway.

## Properties

Name | Type
------------ | -------------
`prompt` | string
`messages` | [Array&lt;LLMMessage&gt;](LLMMessage.md)
`provider` | string
`model` | string
`temperature` | number
`maxTokens` | number
`metadata` | { [key: string]: any; }

## Example

```typescript
import type { LLMRequest } from '@logos/hermes-sdk'

// TODO: Update the object below with actual values
const example = {
  "prompt": null,
  "messages": null,
  "provider": null,
  "model": null,
  "temperature": null,
  "maxTokens": null,
  "metadata": null,
} satisfies LLMRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as LLMRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


