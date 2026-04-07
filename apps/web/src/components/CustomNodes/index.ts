import { ProcessNode } from "./ProcessNode";
import { DecisionNode } from "./DecisionNode";
import { StartEndNode } from "./StartEndNode";

/**
 * 自定义节点类型注册表
 * 用于 ReactFlow 的 nodeTypes prop
 */
export const customNodeTypes = {
  process: ProcessNode,
  decision: DecisionNode,
  startEnd: StartEndNode
};

export { ProcessNode, DecisionNode, StartEndNode };