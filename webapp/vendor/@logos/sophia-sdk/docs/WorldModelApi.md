# WorldModelApi

All URIs are relative to *http://localhost:8000*

| Method | HTTP request | Description |
|------------- | ------------- | -------------|
| [**getState**](WorldModelApi.md#getstate) | **GET** /state | Stream world-model state |



## getState

> StateResponse getState(cursor, limit, modelType)

Stream world-model state

Returns the latest persisted CWM states. Supports pagination cursors and optional filtering. 

### Example

```ts
import {
  Configuration,
  WorldModelApi,
} from '@logos/sophia-sdk';
import type { GetStateRequest } from '@logos/sophia-sdk';

async function example() {
  console.log("🚀 Testing @logos/sophia-sdk SDK...");
  const config = new Configuration({ 
    // Configure HTTP bearer authorization: bearerAuth
    accessToken: "YOUR BEARER TOKEN",
  });
  const api = new WorldModelApi(config);

  const body = {
    // string | Opaque cursor returned by previous request (for pagination) (optional)
    cursor: cursor_example,
    // number | Maximum number of states to return (optional)
    limit: 56,
    // 'CWM_A' | 'CWM_G' | 'CWM_E' | Filter by causal world model layer (optional)
    modelType: modelType_example,
  } satisfies GetStateRequest;

  try {
    const data = await api.getState(body);
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
| **cursor** | `string` | Opaque cursor returned by previous request (for pagination) | [Optional] [Defaults to `undefined`] |
| **limit** | `number` | Maximum number of states to return | [Optional] [Defaults to `50`] |
| **modelType** | `CWM_A`, `CWM_G`, `CWM_E` | Filter by causal world model layer | [Optional] [Defaults to `undefined`] [Enum: CWM_A, CWM_G, CWM_E] |

### Return type

[**StateResponse**](StateResponse.md)

### Authorization

[bearerAuth](../README.md#bearerAuth)

### HTTP request headers

- **Content-Type**: Not defined
- **Accept**: `application/json`


### HTTP response details
| Status code | Description | Response headers |
|-------------|-------------|------------------|
| **200** | List of CWM state records |  -  |
| **401** | Unauthorized |  -  |
| **500** | Internal server error |  -  |

[[Back to top]](#) [[Back to API list]](../README.md#api-endpoints) [[Back to Model list]](../README.md#models) [[Back to README]](../README.md)

