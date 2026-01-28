import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
    ReactFlowProvider,
    addEdge,
    useNodesState,
    useEdgesState,
    Controls,
    Background,
    type Connection,
    type Edge,
    type Node,
    BackgroundVariant,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, useTheme, IconButton, Tooltip } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import CloseIcon from '@mui/icons-material/Close';
import dayjs from 'dayjs';

import CampaignNode from './nodes/CampaignNode';
import EmailNode from './nodes/EmailNode';
import { SchedulerSidebar } from './SchedulerSidebar';
import { NodeEditorPanel } from './NodeEditorPanel';
import { type Campaign, type CampaignEmail, type ScheduledSend } from '../../types/scheduler.types';

const nodeTypes = {
    campaign: CampaignNode,
    email: EmailNode,
};

let id = 0;
const getId = () => `dndnode_${id++}`;

interface FlowchartEditorProps {
    campaigns: Campaign[];
    onUpdateCampaign?: (campaign: Campaign) => void;
    onUpdateEmail?: (email: CampaignEmail) => void;
    onUpdateSend?: (send: ScheduledSend) => void;
    onDeleteCampaign?: () => void;
    onDeleteSend?: (id: number) => void;
    onDuplicateSend?: (send: ScheduledSend) => void;
    onCreateSend?: (campaignId: number, data: any) => void;
}

const FlowchartEditorContent = ({ campaigns, onUpdateCampaign, onUpdateEmail, onUpdateSend, onDeleteSend, onDuplicateSend, onCreateSend }: FlowchartEditorProps) => {
    const theme = useTheme();
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    // Editor Panel State
    const [editorOpen, setEditorOpen] = useState(false);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [selectedNodeData, setSelectedNodeData] = useState<any>(null);
    const [selectedNodeType, setSelectedNodeType] = useState<'campaign' | 'email' | null>(null);

    // Convert campaigns to nodes/edges on load or change
    useEffect(() => {
        if (!campaigns || campaigns.length === 0) return;

        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];
        let yOffset = 0;

        campaigns.forEach((campaign) => {
            const campaignNodeId = `campaign-${campaign.id}`;

            // Campaign Node
            newNodes.push({
                id: campaignNodeId,
                type: 'campaign',
                position: { x: 0, y: yOffset },
                data: {
                    title: campaign.title,
                    category: campaign.category,
                    notes: campaign.notes,
                    // Store original object for updates
                    original: campaign
                },
            });

            let lastNodeId = campaignNodeId;
            let xOffset = 300;

            if (campaign.sends && campaign.sends.length > 0) {
                const sortedSends = [...campaign.sends].sort((a, b) => dayjs(a.send_at).diff(dayjs(b.send_at)));

                sortedSends.forEach((send) => {
                    const sendNodeId = `send-${send.id}`;
                    const email = campaign.emails?.find(e => e.id === send.campaign_email_id);

                    newNodes.push({
                        id: sendNodeId,
                        type: 'email',
                        position: { x: xOffset, y: yOffset },
                        data: {
                            label: email?.subject || 'No Subject',
                            sendDate: send.send_at,
                            buttonName: email?.button_name || 'Donate', // Pass button name
                            isDnr: send.is_dnr || false, // Check for DNR flag
                            dnrDate: send.dnr_date || null, // Check for DNR date
                            service: send.service,
                            customService: send.custom_service || '', // Custom service name
                            account: 'Default',
                            status: send.status,
                            // Store original objects
                            originalSend: send,
                            originalEmail: email
                        }
                    });

                    newEdges.push({
                        id: `e-${lastNodeId}-${sendNodeId}`,
                        source: lastNodeId,
                        target: sendNodeId,
                        animated: true,
                        style: { stroke: theme.palette.text.secondary }
                    });

                    lastNodeId = sendNodeId;
                    xOffset += 350;
                });
            }

            yOffset += 300;
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [campaigns, theme.palette.text.secondary]);

    const onConnect = useCallback(
        (params: Connection) => setEdges((eds) => addEdge(params, eds)),
        [setEdges]
    );

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            if (typeof type === 'undefined' || !type) return;

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode: Node = {
                id: getId(),
                type,
                position,
                data: {
                    label: type === 'campaign' ? 'New Campaign' : 'New Email',
                    title: type === 'campaign' ? 'New Campaign' : undefined,
                    category: 'Other',
                    notes: '',
                    delay: 24,
                    service: 'Automation',
                    account: 'Default',
                    status: 'draft'
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [reactFlowInstance, setNodes]
    );

    const onNodeDoubleClick = useCallback((_: React.MouseEvent, node: Node) => {
        setSelectedNodeId(node.id);
        setSelectedNodeData(node.data);
        setSelectedNodeType(node.type as 'campaign' | 'email');
        setEditorOpen(true);
    }, []);

    const handleSaveNodeData = (newData: any) => {
        if (!selectedNodeId) return;

        // Update local state
        setNodes((nds) =>
            nds.map((node) => {
                if (node.id === selectedNodeId) {
                    return { ...node, data: { ...node.data, ...newData } };
                }
                return node;
            })
        );

        // Propagate updates to parent
        if (selectedNodeType === 'campaign' && onUpdateCampaign && newData.original) {
            onUpdateCampaign({ ...newData.original, ...newData });
        } else if (selectedNodeType === 'email') {
            if (onUpdateEmail && newData.originalEmail) {
                onUpdateEmail({
                    ...newData.originalEmail,
                    title: newData.label,
                    subject: newData.label,
                    button_name: newData.buttonName
                });
            }
            if (onUpdateSend && newData.originalSend) {
                onUpdateSend({
                    ...newData.originalSend,
                    service: newData.service,
                    custom_service: newData.customService,
                    status: newData.status,
                    is_dnr: newData.isDnr,
                    dnr_date: newData.dnrDate
                });
            } else if (onCreateSend && !newData.originalSend) {
                // Handle creation of new send
                // Find parent campaign
                const incomingEdge = edges.find(e => e.target === selectedNodeId);
                if (incomingEdge) {
                    const sourceNode = nodes.find(n => n.id === incomingEdge.source);
                    if (sourceNode && sourceNode.type === 'campaign' && sourceNode.data.original) {
                        onCreateSend(sourceNode.data.original.id, newData);
                    } else if (sourceNode && sourceNode.type === 'email' && sourceNode.data.originalSend) {
                        // If connected to another email, use its campaign_id
                        // Note: This assumes emails are in the same campaign
                        // We might need to fetch the campaign from the email's campaign_email_id -> campaign
                        // But for now, let's assume we can get it from the source node's originalSend.campaign_email_id (which links to campaign_email, which links to campaign)
                        // Actually, originalSend doesn't have campaign_id directly.
                        // But we have campaigns prop.
                        const campaign = campaigns.find(c => c.emails?.some(e => e.id === sourceNode.data.originalSend.campaign_email_id));
                        if (campaign) {
                            onCreateSend(campaign.id, newData);
                        }
                    }
                } else {
                    console.warn('Cannot create send: No parent campaign found (node not connected)');
                    // Maybe show a toast or alert?
                }
            }
        }
    };

    const handleDeleteNode = () => {
        if (!selectedNodeId) return;

        if (selectedNodeType === 'email' && onDeleteSend && selectedNodeData.originalSend) {
            onDeleteSend(selectedNodeData.originalSend.id);
        }

        setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
        setEditorOpen(false);
    };

    const handleDuplicateNode = () => {
        console.log('handleDuplicateNode called', { selectedNodeId, selectedNodeData, onDuplicateSend });
        if (!selectedNodeId || !selectedNodeData.originalSend || !onDuplicateSend) {
            console.error('Missing data for duplication', {
                hasId: !!selectedNodeId,
                hasOriginalSend: !!selectedNodeData?.originalSend,
                hasHandler: !!onDuplicateSend
            });
            return;
        }
        console.log('Calling onDuplicateSend with:', selectedNodeData.originalSend);
        onDuplicateSend(selectedNodeData.originalSend);
        setEditorOpen(false);
    };

    return (
        <Box sx={{ display: 'flex', height: '100%', width: '100%', position: 'relative' }}>
            {/* Sidebar - Only shown when open */}
            {sidebarOpen && (
                <Box
                    sx={{
                        width: 250,
                        flexShrink: 0,
                        height: '100%',
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        zIndex: 10,
                        boxShadow: 3
                    }}
                >
                    <Box sx={{ position: 'relative', height: '100%' }}>
                        <IconButton
                            onClick={() => setSidebarOpen(false)}
                            sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                zIndex: 11
                            }}
                            size="small"
                        >
                            <CloseIcon />
                        </IconButton>
                        <SchedulerSidebar />
                    </Box>
                </Box>
            )}

            {/* Toggle Button - Always visible */}
            {!sidebarOpen && (
                <Tooltip title="Show Toolbox" placement="right">
                    <IconButton
                        onClick={() => setSidebarOpen(true)}
                        sx={{
                            position: 'absolute',
                            left: 16,
                            top: 16,
                            zIndex: 10,
                            bgcolor: 'background.paper',
                            border: `1px solid ${theme.palette.divider}`,
                            boxShadow: 2,
                            '&:hover': { bgcolor: 'action.hover' }
                        }}
                        size="medium"
                    >
                        <MenuIcon />
                    </IconButton>
                </Tooltip>
            )}

            {/* Canvas - Always full width */}
            <Box sx={{ width: '100%', height: '100%' }} ref={reactFlowWrapper}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onInit={setReactFlowInstance}
                    onDrop={onDrop}
                    onDragOver={onDragOver}
                    onNodeDoubleClick={onNodeDoubleClick}
                    nodeTypes={nodeTypes}
                    fitView
                >
                    <Controls />
                    <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                </ReactFlow>
            </Box>

            <NodeEditorPanel
                open={editorOpen}
                nodeData={selectedNodeData}
                nodeType={selectedNodeType}
                onClose={() => setEditorOpen(false)}
                onSave={handleSaveNodeData}
                onDelete={handleDeleteNode}
                onDuplicate={selectedNodeType === 'email' ? handleDuplicateNode : undefined}
            />
        </Box>
    );
};

export const FlowchartEditor = (props: FlowchartEditorProps) => {
    return (
        <ReactFlowProvider>
            <FlowchartEditorContent {...props} />
        </ReactFlowProvider>
    );
};
