
# SimulationRequest


## Properties

Name | Type
------------ | -------------
`capabilityId` | string
`context` | { [key: string]: any; }
`horizonSteps` | number
`assumptions` | Array&lt;string&gt;
`metadata` | { [key: string]: any; }

## Example

```typescript
import type { SimulationRequest } from '@logos/sophia-sdk'

// TODO: Update the object below with actual values
const example = {
  "capabilityId": null,
  "context": null,
  "horizonSteps": null,
  "assumptions": null,
  "metadata": null,
} satisfies SimulationRequest

console.log(example)

// Convert the instance to a JSON string
const exampleJSON: string = JSON.stringify(example)
console.log(exampleJSON)

// Parse the JSON string back to an object
const exampleParsed = JSON.parse(exampleJSON) as SimulationRequest
console.log(exampleParsed)
```

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


