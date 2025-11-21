
# StateResponse


## Properties

Name | Type
------------ | -------------
`states` | [Array&lt;CWMState&gt;](CWMState.md)
`cursor` | string
`nextPollAfterMs` | number

## Example

```typescript
import type { StateResponse } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "states": null,
  "cursor": null,
  "nextPollAfterMs": null,
} satisfies StateResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as StateResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


