// Re-export from directory-manager for backwards compatibility
export {
  getGlobalMCPDir,
  getProjectMCPDir,
  getMCPServerPath,
  loadMCPServer,
  saveMCPServer,
  removeMCPServer,
  discoverAllMCPServers,
  resolveMCPServersByName,
  getAllServers,
} from './directory-manager.js';
