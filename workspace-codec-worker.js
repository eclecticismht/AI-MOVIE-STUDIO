// Only encode project JSON. No network, credentials, files or persistent state.
importScripts('vendor/lz-string/lz-string.js', 'workspace-store.js?v=20261004-input2');
self.onmessage = ({data}) => {
  try { self.postMessage({id:data.id, encoded:WorkspaceStore.encode(data.value)}); }
  catch (error) { self.postMessage({id:data.id, error:error.message}); }
};
