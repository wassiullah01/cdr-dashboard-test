export const apiUrl = (endpoint) => {
  return endpoint;
};

/**
 * Fetch network graph data
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Network graph data
 */
export async function getNetworkGraph(params) {
  const queryParams = new URLSearchParams();
  
  if (params.uploadId) queryParams.append('uploadId', params.uploadId);
  if (params.from) queryParams.append('from', params.from);
  if (params.to) queryParams.append('to', params.to);
  if (params.eventType) queryParams.append('eventType', params.eventType);
  if (params.minEdgeWeight) queryParams.append('minEdgeWeight', params.minEdgeWeight);
  if (params.limitNodes) queryParams.append('limitNodes', params.limitNodes);
  if (params.limitEdges) queryParams.append('limitEdges', params.limitEdges);

  const response = await fetch(apiUrl(`/api/analytics/network?${queryParams}`));
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Network request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}
