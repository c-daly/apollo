
# TextToSpeechRequest


## Properties

Name | Type
------------ | -------------
`text` | string
`voice` | string
`language` | string

## Example

```typescript
import type { TextToSpeechRequest } from '@logos/hermes-sdk'

// TODO: Update the object below with actual values
const example = {
  "text": null,
  "voice": null,
  "language": null,
} satisfies TextToSpeechRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as TextToSpeechRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


