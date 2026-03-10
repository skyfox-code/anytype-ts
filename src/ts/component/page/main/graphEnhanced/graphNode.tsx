import React from 'react';
import { observer } from 'mobx-react';
import { IconObject, ObjectName } from 'Component';
import { S, U, translate } from 'Lib';

interface GraphNodeData {
	id: string;
	name: string;
	type: string;
	layout: number;
	snippet: string;
	linkCnt: number;
};

interface Props {
	node: GraphNodeData;
	position: { x: number; y: number };
};

const GraphNode = observer(({ node, position }: Props) => {

	const object = S.Detail.get(node.id, node.id, []);
	const type = S.Record.getTypeById(node.type);
	const typeName = type ? type.name : '';

	const style: React.CSSProperties = {
		left: position.x,
		top: position.y,
	};

	return (
		<div
			className="graphNodePreview"
			style={style}
			aria-label={translate('graphEnhancedNodePreview')}
		>
			<div className="previewHead">
				<IconObject object={object} size={20} />
				<ObjectName object={object} />
			</div>

			{typeName ? (
				<div className="previewType">{typeName}</div>
			) : ''}

			{node.snippet ? (
				<div className="previewSnippet">{node.snippet}</div>
			) : ''}

			<div className="previewLinks">
				{translate('graphEnhancedLinkCount').replace('%s', String(node.linkCnt))}
			</div>
		</div>
	);

});

export default GraphNode;
