import React, { forwardRef, useRef, useEffect, useState, useCallback, useImperativeHandle } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceX, forceY, forceCollide } from 'd3-force';
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import { select, pointer } from 'd3-selection';
import type { Selection } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import type { ZoomBehavior, D3ZoomEvent, ZoomTransform } from 'd3-zoom';
import { drag as d3Drag } from 'd3-drag';
import type { D3DragEvent } from 'd3-drag';
import { observer } from 'mobx-react';
import { I, C, S, U, J, keyboard, sidebar, translate, analytics } from 'Lib';
import { Header, Footer, Loader } from 'Component';
import GraphNode from './graphNode';
import GraphControls from './graphControls';

interface EnhancedNode extends SimulationNodeDatum {
	id: string;
	name: string;
	shortName: string;
	type: string;
	layout: number;
	snippet: string;
	linkCnt: number;
	lastModified: number;
	iconOption: number;
	isPinned: boolean;
};

interface EnhancedEdge extends SimulationLinkDatum<EnhancedNode> {
	source: string | EnhancedNode;
	target: string | EnhancedNode;
	type: number;
};

interface TypeOption {
	id: string;
	name: string;
	iconOption: number;
	count: number;
};

interface FilterState {
	types: Set<string>;
	dateRange: number;
	isolate: boolean;
	search: string;
};

interface HoverState {
	node: EnhancedNode;
	position: { x: number; y: number };
};

const LABEL_ZOOM_THRESHOLD = 1.5;
const MIN_RADIUS = 8;
const MAX_RADIUS = 24;

const PageMainGraphEnhanced = observer(forwardRef<I.PageRef, I.PageComponent>((props, ref) => {

	const { isPopup } = props;
	const nodeRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const gRef = useRef<SVGGElement>(null);
	const simulationRef = useRef<Simulation<EnhancedNode, EnhancedEdge> | null>(null);
	const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
	const transformRef = useRef<ZoomTransform>(zoomIdentity);
	const selectedRef = useRef<string | null>(null);
	const pinnedRef = useRef<Set<string>>(new Set());
	const rootIdRef = useRef('');
	const key = J.Constant.graphId.global;

	const [ data, setData ] = useState<{ nodes: EnhancedNode[]; edges: EnhancedEdge[] }>({ nodes: [], edges: [] });
	const [ hover, setHover ] = useState<HoverState | null>(null);
	const [ filter, setFilter ] = useState<FilterState>({ types: new Set(), dateRange: 0, isolate: false, search: '' });
	const [ typeOptions, setTypeOptions ] = useState<TypeOption[]>([]);

	const getRootId = useCallback(() => {
		return rootIdRef.current || keyboard.getRootId(isPopup);
	}, [ isPopup ]);

	const nodeMapper = useCallback((d: Record<string, unknown>): EnhancedNode => {
		const obj = d as Record<string, unknown>;
		const type = S.Record.getTypeById(obj.type as string);
		const detail = S.Detail.get(obj.id as string, obj.id as string, []);
		const name = U.Object.name(obj as { name?: string; layout?: number }, true) || '';
		const snippet = String(detail.snippet || detail.description || '').slice(0, 100);

		return {
			id: obj.id as string,
			name: U.Smile.strip(name),
			shortName: U.String.shorten(U.Smile.strip(name), 24),
			type: obj.type as string,
			layout: Number(obj.layout) || 0,
			snippet,
			linkCnt: 0,
			lastModified: Number(obj.lastModifiedDate) || 0,
			iconOption: type ? (type.iconOption || 0) : 0,
			isPinned: false,
		};
	}, []);

	const load = useCallback(() => {
		setLoading(true);

		const settings = S.Common.getGraph(key);

		C.ObjectGraph(S.Common.space, U.Data.getGraphFilters(), 0, [], J.Relation.graph, '', [], settings.typeEdges, (message: { error: { code: number }; nodes: Record<string, unknown>[]; edges: { source: string; target: string; type: number }[] }) => {
			setLoading(false);

			if (message.error.code) {
				return;
			};

			const mapped = U.Data.getGraphData(message);
			const nodes: EnhancedNode[] = mapped.nodes.map(nodeMapper);
			const nodeSet = new Set(nodes.map(n => n.id));
			const edges: EnhancedEdge[] = mapped.edges
				.filter((e: { source: string; target: string }) => nodeSet.has(e.source) && nodeSet.has(e.target))
				.map((e: { source: string; target: string; type: number }) => ({
					source: e.source,
					target: e.target,
					type: e.type,
				}));

			// Count links per node
			const linkMap = new Map<string, number>();
			edges.forEach(e => {
				const s = typeof e.source === 'string' ? e.source : e.source.id;
				const t = typeof e.target === 'string' ? e.target : e.target.id;

				linkMap.set(s, (linkMap.get(s) || 0) + 1);
				linkMap.set(t, (linkMap.get(t) || 0) + 1);
			});

			nodes.forEach(n => {
				n.linkCnt = linkMap.get(n.id) || 0;
				n.isPinned = pinnedRef.current.has(n.id);

				if (n.isPinned) {
					n.fx = n.x;
					n.fy = n.y;
				};
			});

			// Build type options
			const typeMap = new Map<string, TypeOption>();
			nodes.forEach(n => {
				if (!typeMap.has(n.type)) {
					const type = S.Record.getTypeById(n.type);

					typeMap.set(n.type, {
						id: n.type,
						name: type ? type.name : n.type,
						iconOption: n.iconOption,
						count: 0,
					});
				};

				const opt = typeMap.get(n.type);
				if (opt) {
					opt.count++;
				};
			});

			const types = Array.from(typeMap.values()).sort((a, b) => b.count - a.count);

			setTypeOptions(types);
			setFilter(prev => ({ ...prev, types: new Set(types.map(t => t.id)) }));
			setData({ nodes, edges });
		});
	}, [ key, nodeMapper ]);

	const setLoading = (v: boolean) => {
		const node = nodeRef.current;
		if (!node) {
			return;
		};

		const loader = node.querySelector('#loader') as HTMLElement;
		if (!loader) {
			return;
		};

		if (v) {
			loader.style.display = 'block';
			loader.style.opacity = '1';
		} else {
			loader.style.opacity = '0';
			window.setTimeout(() => { loader.style.display = 'none'; }, 200);
		};
	};

	const getRadius = useCallback((d: EnhancedNode): number => {
		if (!data.nodes.length) {
			return MIN_RADIUS;
		};

		const maxLinks = Math.max(...data.nodes.map(n => n.linkCnt), 1);
		const ratio = d.linkCnt / maxLinks;

		return MIN_RADIUS + (ratio * (MAX_RADIUS - MIN_RADIUS));
	}, [ data.nodes ]);

	const getNodeColor = useCallback((d: EnhancedNode): string => {
		return U.Common.iconBgByOption(d.iconOption) || J.Theme[S.Common.getThemeClass()]?.graph?.node || '#b6b6b6';
	}, []);

	const getFilteredData = useCallback(() => {
		const now = Date.now() / 1000;
		const cutoff = filter.dateRange > 0 ? now - (filter.dateRange * 86400) : 0;

		let filteredNodes = data.nodes.filter(n => {
			if (!filter.types.has(n.type)) {
				return false;
			};

			if ((cutoff > 0) && (n.lastModified < cutoff)) {
				return false;
			};

			return true;
		});

		const nodeIds = new Set(filteredNodes.map(n => n.id));
		let filteredEdges = data.edges.filter(e => {
			const s = typeof e.source === 'string' ? e.source : e.source.id;
			const t = typeof e.target === 'string' ? e.target : e.target.id;

			return nodeIds.has(s) && nodeIds.has(t);
		});

		return { nodes: filteredNodes, edges: filteredEdges };
	}, [ data, filter ]);

	const getNodeOpacity = useCallback((d: EnhancedNode): number => {
		const search = filter.search.toLowerCase();

		if (search && !d.name.toLowerCase().includes(search)) {
			return 0.1;
		};

		if (filter.isolate && selectedRef.current) {
			const connectedIds = new Set<string>();
			connectedIds.add(selectedRef.current);

			data.edges.forEach(e => {
				const s = typeof e.source === 'string' ? e.source : e.source.id;
				const t = typeof e.target === 'string' ? e.target : e.target.id;

				if (s === selectedRef.current) {
					connectedIds.add(t);
				};

				if (t === selectedRef.current) {
					connectedIds.add(s);
				};
			});

			if (!connectedIds.has(d.id)) {
				return 0.1;
			};
		};

		return 1;
	}, [ filter, data.edges ]);

	const getEdgeOpacity = useCallback((d: EnhancedEdge): number => {
		const s = typeof d.source === 'string' ? d.source : d.source.id;
		const t = typeof d.target === 'string' ? d.target : d.target.id;

		if (hover?.node && ((s === hover.node.id) || (t === hover.node.id))) {
			return 0.8;
		};

		if (filter.isolate && selectedRef.current) {
			if ((s !== selectedRef.current) && (t !== selectedRef.current)) {
				return 0.05;
			};

			return 0.8;
		};

		return 0.3;
	}, [ hover, filter ]);

	const initGraph = useCallback(() => {
		if (!svgRef.current || !gRef.current) {
			return;
		};

		const svg = select(svgRef.current);
		const g = select(gRef.current);
		const { nodes, edges } = getFilteredData();
		const themeKey = S.Common.getThemeClass();
		const themeGraph = J.Theme[themeKey]?.graph || J.Theme['']?.graph;
		const rect = svgRef.current.getBoundingClientRect();
		const width = rect.width;
		const height = rect.height;

		// Clear previous
		g.selectAll('*').remove();

		if (simulationRef.current) {
			simulationRef.current.stop();
		};

		// Build simulation
		const simulation = forceSimulation<EnhancedNode>(nodes)
			.force('link', forceLink<EnhancedNode, EnhancedEdge>(edges)
				.id(d => d.id)
				.distance(100)
			)
			.force('charge', forceManyBody<EnhancedNode>().strength(-250).distanceMax(1000))
			.force('center', forceCenter(width / 2, height / 2))
			.force('x', forceX<EnhancedNode>(width / 2).strength(0.01))
			.force('y', forceY<EnhancedNode>(height / 2).strength(0.01))
			.force('collide', forceCollide<EnhancedNode>().radius(d => getRadius(d) + 2))
			.alphaDecay(0.05);

		simulationRef.current = simulation;

		// Edges
		const link = g.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(edges)
			.join('line')
			.attr('stroke', themeGraph?.link || '#dfddd0')
			.attr('stroke-width', 1)
			.attr('stroke-opacity', 0.3);

		// Nodes
		const node = g.append('g')
			.attr('class', 'nodes')
			.selectAll('circle')
			.data(nodes)
			.join('circle')
			.attr('r', d => getRadius(d))
			.attr('fill', d => getNodeColor(d))
			.attr('stroke', 'none')
			.attr('opacity', d => getNodeOpacity(d))
			.attr('aria-label', d => d.name)
			.call(drag(simulation) as unknown as (selection: Selection<SVGCircleElement, EnhancedNode, SVGGElement, unknown>) => void);

		// Labels
		const label = g.append('g')
			.attr('class', 'labels')
			.selectAll('text')
			.data(nodes)
			.join('text')
			.text(d => d.shortName)
			.attr('font-size', '11px')
			.attr('fill', themeGraph?.text || '#b6b6b6')
			.attr('text-anchor', 'middle')
			.attr('dy', d => getRadius(d) + 14)
			.attr('opacity', 0)
			.attr('pointer-events', 'none');

		// Node interactions
		node
			.on('mouseover', (event: MouseEvent, d: EnhancedNode) => {
				const [ x, y ] = pointer(event, svgRef.current);

				setHover({ node: d, position: { x: x + 16, y: y - 8 } });

				link
					.attr('stroke-opacity', (e: EnhancedEdge) => {
						const s = typeof e.source === 'string' ? e.source : (e.source as EnhancedNode).id;
						const t = typeof e.target === 'string' ? e.target : (e.target as EnhancedNode).id;

						return ((s === d.id) || (t === d.id)) ? 0.8 : 0.3;
					});
			})
			.on('mouseout', () => {
				setHover(null);
				link.attr('stroke-opacity', 0.3);
			})
			.on('click', (_event: MouseEvent, d: EnhancedNode) => {
				selectedRef.current = d.id;
				const object = S.Detail.get(d.id, d.id, []);

				if (object && !object._empty_) {
					U.Object.openAuto(object);
				};
			})
			.on('contextmenu', (event: MouseEvent, d: EnhancedNode) => {
				event.preventDefault();
				event.stopPropagation();
				selectedRef.current = d.id;

				onContextMenu(d, { x: event.clientX, y: event.clientY });
			});

		// Double-click background to reset zoom
		svg.on('dblclick.zoom', null);
		svg.on('dblclick', () => {
			svg.transition()
				.duration(500)
				.call(zoomRef.current?.transform as unknown as (transition: any, transform: ZoomTransform) => void, zoomIdentity);
		});

		// Zoom behavior
		const zoomBehavior = zoom<SVGSVGElement, unknown>()
			.scaleExtent([ 0.05, 10 ])
			.on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
				transformRef.current = event.transform;
				g.attr('transform', event.transform.toString());

				const showLabels = event.transform.k >= LABEL_ZOOM_THRESHOLD;
				label.attr('opacity', showLabels ? 1 : 0);
			});

		zoomRef.current = zoomBehavior;
		svg.call(zoomBehavior);

		// Simulation tick
		simulation.on('tick', () => {
			link
				.attr('x1', (d: EnhancedEdge) => (d.source as EnhancedNode).x || 0)
				.attr('y1', (d: EnhancedEdge) => (d.source as EnhancedNode).y || 0)
				.attr('x2', (d: EnhancedEdge) => (d.target as EnhancedNode).x || 0)
				.attr('y2', (d: EnhancedEdge) => (d.target as EnhancedNode).y || 0);

			node
				.attr('cx', (d: EnhancedNode) => d.x || 0)
				.attr('cy', (d: EnhancedNode) => d.y || 0);

			label
				.attr('x', (d: EnhancedNode) => d.x || 0)
				.attr('y', (d: EnhancedNode) => d.y || 0);
		});

	}, [ getFilteredData, getRadius, getNodeColor, getNodeOpacity ]);

	const drag = useCallback((simulation: Simulation<EnhancedNode, EnhancedEdge>) => {
		const dragstarted = (event: D3DragEvent<SVGCircleElement, EnhancedNode, EnhancedNode>) => {
			if (!event.active) {
				simulation.alphaTarget(0.3).restart();
			};

			event.subject.fx = event.subject.x;
			event.subject.fy = event.subject.y;
			setHover(null);
		};

		const dragged = (event: D3DragEvent<SVGCircleElement, EnhancedNode, EnhancedNode>) => {
			event.subject.fx = event.x;
			event.subject.fy = event.y;
		};

		const dragended = (event: D3DragEvent<SVGCircleElement, EnhancedNode, EnhancedNode>) => {
			if (!event.active) {
				simulation.alphaTarget(0);
			};

			if (!pinnedRef.current.has(event.subject.id)) {
				event.subject.fx = null;
				event.subject.fy = null;
			};
		};

		return d3Drag<SVGCircleElement, EnhancedNode>()
			.on('start', dragstarted)
			.on('drag', dragged)
			.on('end', dragended);
	}, []);

	const onContextMenu = useCallback((d: EnhancedNode, position: { x: number; y: number }) => {
		const menuParam = {
			element: svgRef.current,
			rect: { x: position.x, y: position.y, width: 0, height: 0 },
			vertical: I.MenuDirection.Center,
			horizontal: I.MenuDirection.Center,
		};

		S.Menu.open('objectContext', {
			...menuParam,
			data: {
				route: analytics.route.graph,
				objectIds: [ d.id ],
				getObject: (id: string) => {
					const node = data.nodes.find(n => n.id === id);
					return node ? S.Detail.get(id, id, []) : null;
				},
				allowedOpen: true,
				allowedNewTab: true,
				onMore: [
					{
						id: 'pinNode',
						name: pinnedRef.current.has(d.id) ? translate('graphEnhancedUnpin') : translate('graphEnhancedPin'),
						onClick: () => {
							if (pinnedRef.current.has(d.id)) {
								pinnedRef.current.delete(d.id);
								d.fx = null;
								d.fy = null;
								d.isPinned = false;
							} else {
								pinnedRef.current.add(d.id);
								d.fx = d.x;
								d.fy = d.y;
								d.isPinned = true;
							};

							simulationRef.current?.alpha(0.3).restart();
						},
					},
				],
			},
		});
	}, [ data.nodes ]);

	const resize = useCallback(() => {
		const container = U.Common.getScrollContainer(isPopup);
		const obj = U.Common.getPageContainer(isPopup);
		const node = nodeRef.current;

		if (!node) {
			return;
		};

		const wrapper = obj.find('.wrapper');
		const header = $(node).find('#header');
		const height = container.height() - header.height();

		wrapper.css({ height });

		if (isPopup) {
			const element = $('#popupPage .content');

			if (element.length) {
				element.css({ minHeight: 'unset', height: '100%' });
			};
		};
	}, [ isPopup ]);

	const onTab = useCallback((id: string) => {
		const tab = U.Menu.getGraphTabs().find(it => it.id == id);

		if (tab) {
			U.Object.openAuto({ id: getRootId(), layout: tab.layout });
		};
	}, [ getRootId ]);

	const onToggleView = useCallback(() => {
		S.Common.graphSet(key, { enhanced: false });
		$(window).trigger(`updateGraphView.${key}`);
	}, [ key ]);

	useEffect(() => {
		const win = $(window);

		win.on(`updateGraphRoot.${key}`, (_e: any, data: any) => {
			rootIdRef.current = data.id;
		});

		win.on(`keydown.${key}`, (e: any) => {
			keyboard.shortcut('searchText', e, () => $('#button-header-search').trigger('click'));
		});

		win.on(`sidebarResize.${key}`, () => resize());

		rootIdRef.current = getRootId();
		sidebar.rightPanelClose(isPopup, false);
		load();

		return () => {
			const events = [ 'keydown', 'updateGraphRoot', 'sidebarResize' ];
			$(window).off(events.map(it => `${it}.${key}`).join(' '));

			if (simulationRef.current) {
				simulationRef.current.stop();
			};
		};
	}, []);

	useEffect(() => {
		resize();
		initGraph();
	}, [ data ]);

	useEffect(() => {
		initGraph();
	}, [ filter ]);

	useEffect(() => resize());

	useImperativeHandle(ref, () => ({
		resize,
	}));

	const rootId = getRootId();

	return (
		<div
			ref={nodeRef}
			className="body"
		>
			<Header
				{...props}
				ref={headerRef}
				component="mainGraph"
				rootId={rootId}
				tabs={U.Menu.getGraphTabs()}
				tab="graph"
				onTab={onTab}
				layout={I.ObjectLayout.Graph}
			/>

			<Loader id="loader" />

			<div className="wrapper">
				<div className="graphEnhanced">
					<GraphControls
						types={typeOptions}
						filter={filter}
						onFilterChange={setFilter}
					/>

					<div className="graphCanvas">
						<svg ref={svgRef} className="graphSvg">
							<g ref={gRef} />
						</svg>

						<div className="graphToggle" onClick={onToggleView} aria-label={translate('graphEnhancedSwitchToStandard')}>
							{translate('graphEnhancedSwitchToStandard')}
						</div>

						{hover ? (
							<GraphNode
								node={hover.node}
								position={hover.position}
							/>
						) : ''}
					</div>
				</div>
			</div>

			<Footer component="mainObject" />
		</div>
	);

}));

export default PageMainGraphEnhanced;
