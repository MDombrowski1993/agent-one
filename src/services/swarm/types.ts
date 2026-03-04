export interface RoleInfo {
  name: string;
  description: string;
  scope: 'global' | 'project';
  path: string;
}

export interface SwarmMetadata {
  name: string;
  taskDescription: string;
  roles: string[];
  createdAt: string;
  status: 'in-progress' | 'completed' | 'failed';
  currentRoleIndex: number;
}

export interface Handoff {
  roleName: string;
  content: string;
  timestamp: string;
}
