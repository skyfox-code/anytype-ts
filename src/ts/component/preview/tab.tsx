import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react';
import { ObjectName, IconObject } from 'Component';
import { U, I } from 'Lib';

interface Props {
	spaceview?: any;
	object?: any;
	position?: () => void;
};

const PreviewTab = observer(forwardRef<{}, Props>((props, ref) => {

	const {
		spaceview = {},
		object,
		position,
	} = props;

	const [ dummy, setDummy ] = useState(0);
	const objectRef = useRef(object);

	useEffect(() => {
		if (!object?.id || (object?.layout == I.ObjectLayout.SpaceView)) {
			objectRef.current = {};
			setDummy(dummy + 1);
			return;
		};

		let cancelled = false;

		objectRef.current = object;

		U.Object.getById(object.id, { spaceId: spaceview.targetSpaceId }, (loaded: any) => {
			if (loaded && !cancelled) {
				objectRef.current = loaded;
				setDummy(dummy + 1);
			};
		});

		return () => { cancelled = true; };
	}, [ object?.id ]);

	useEffect(position);

	return (
		<div className="previewTab">
			<div className="previewHeader">
				<IconObject object={spaceview} />
				<ObjectName object={spaceview} />
			</div>
			{objectRef.current && objectRef.current.name ? (
				<div className="previewObject">
					<IconObject object={objectRef.current} />
					<ObjectName object={objectRef.current} />
				</div>
			) : null}
		</div>
	);

}));

export default PreviewTab;
