
# CWMESentimentData

Payload for CWM-E (persona/emotion) outputs.

## Properties

Name | Type
------------ | -------------
`sentiment` | string
`confidenceDelta` | number
`cautionDelta` | number
`narrative` | string

## Example

```typescript
import type { CWMESentimentData } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "sentiment": null,
  "confidenceDelta": null,
  "cautionDelta": null,
  "narrative": null,
} satisfies CWMESentimentData

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as CWMESentimentData
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


