import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { ObjectName, IconObject, ObjectType } from 'Component';
import { U, I, translate } from 'Lib';

interface Props {
	spaceview?: any;
	data?: any;
	position?: () => void;
};

const PreviewTab = observer(forwardRef<{}, Props>((props, ref) => {

	const {
		spaceview = {},
		data,
		position,
	} = props;

	const { object, name, action } = data;
	const [ dummy, setDummy ] = useState(0);
	const objectRef = useRef({});
	const cancelRef = useRef(false);

	useEffect(() => {
		load();

		return () => {
			cancelRef.current = true;
			objectRef.current = {};
		};
	}, [ object?.id ]);

	useEffect(position);

	const load = () => {
		const isChat = object?.layout == I.ObjectLayout.SpaceView && (spaceview.isOneToOne || spaceview.isChat)

		if (isChat) {
			objectRef.current = { layout: I.ObjectLayout.Chat, name: translate('commonMainChat') };
		} else
		if (object && object.id) {
			loadObject();
		} else
		if (action && name) {
			objectByAction();
		};
	};

	const objectByAction = () => {
		const layouts = {
			navigation: I.ObjectLayout.Navigation,
			graph: I.ObjectLayout.Graph,
			archive: I.ObjectLayout.Archive,
			settings: I.ObjectLayout.Settings,
		};

		if (layouts[action]) {
			objectRef.current = { layout: layouts[action], name };
			setDummy(dummy + 1);
		};
	};

	const loadObject = () => {
		U.Object.getById(object.id, { spaceId: spaceview.targetSpaceId }, (loaded: any) => {
			if (loaded && !cancelRef.current) {
				objectRef.current = loaded;
				setDummy(dummy + 1);
			};
		});
	};

	return (
		<div className="previewTab">
			<div className="previewHeader">
				<IconObject object={spaceview} />
				<ObjectName object={spaceview} />
			</div>
			{objectRef.current && objectRef.current.name ? (
				<div className="previewObject">
					<div className="side left">
						<IconObject object={objectRef.current} size={48} />
					</div>
					<div className="side right">
						<ObjectName object={objectRef.current} />
						{objectRef?.current.type ? <ObjectType object={objectRef.current} /> : ''}
					</div>
				</div>
			) : null}
		</div>
	);

}));

export default PreviewTab;
