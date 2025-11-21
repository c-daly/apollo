# PlanningApi

All URIs are relative to *http://localhost:8000*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**createPlan**](PlanningApi.md#createplan) | **POST** /plan | Create plan |
| [**runSimulation**](PlanningApi.md#runsimulation) | **POST** /simulate | Run capability simulation |



## createPlan

> PlanResponse createPlan(planRequest)

Create plan

Generate a plan for the given goal/context and persist resulting CWM state updates. Successful responses include identifiers plus any new CWM_A/CWM_G/CWM_E records. 

### Example

```ts
import {
  Configuration,
  PlanningApi,
} from '@logos/sophia-sdk';
import type { CreatePlanRequest } from '@logos/sophia-sdk';

async function example() {
  console.log("🚀 Testing @logos/sophia-sdk SDK...");
  const config = new Configuration({ 
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PlanningApi(config);

  const body = {
    // PlanRequest
    planRequest: ...,
  } satisfies CreatePlanRequest;

  try {
    const data = await api.createPlan(body);
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
| **planRequest** | [PlanRequest](PlanRequest.md) |  | |

### Return type

[**PlanResponse**](PlanResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **201** | Plan created successfully |  -  |
| **400** | Invalid request payload |  -  |
| **401** | Unauthorized |  -  |
| **422** | Planning failed due to constraints/validation |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)


## runSimulation

> SimulationResponse runSimulation(simulationRequest)

Run capability simulation

Performs JEPA/simulator rollouts for the requested capability using supplied context. Imagined CWM states are persisted and returned to the caller. 

### Example

```ts
import {
  Configuration,
  PlanningApi,
} from '@logos/sophia-sdk';
import type { RunSimulationRequest } from '@logos/sophia-sdk';

async function example() {
  console.log("🚀 Testing @logos/sophia-sdk SDK...");
  const config = new Configuration({ 
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new PlanningApi(config);

  const body = {
    // SimulationRequest
    simulationRequest: ...,
  } satisfies RunSimulationRequest;

  try {
    const data = await api.runSimulation(body);
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
| **simulationRequest** | [SimulationRequest](SimulationRequest.md) |  | |

### Return type

[**SimulationResponse**](SimulationResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: `application/json`
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | Simulation completed |  -  |
| **400** | Invalid request payload |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

