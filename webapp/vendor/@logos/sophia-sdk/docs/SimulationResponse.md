
# SimulationResponse


## Properties

Name | Type
------------ | -------------
`simulationId` | string
`status` | string
`durationMs` | number
`states` | [Array&lt;CWMState&gt;](CWMState.md)

## Example

```typescript
import type { SimulationResponse } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "simulationId": null,
  "status": null,
  "durationMs": null,
  "states": null,
} satisfies SimulationResponse

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SimulationResponse
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


