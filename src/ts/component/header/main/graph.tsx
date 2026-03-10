import React, { forwardRef, useRef, useEffect } from 'react';
import { Icon } from 'Component';
import { I, S, U, J, translate } from 'Lib';

const HeaderMainGraph = forwardRef<{}, I.HeaderComponent>((props, ref) => {

	const { renderLeftIcons, renderTabs, menuOpen, rootId } = props;
	const rootIdRef = useRef('');
	const key = J.Constant.graphId.global;

	const unbind = () => {
		$(window).off(`updateGraphRoot.header`);
	};

	const rebind = () => {
		const win = $(window);

		unbind();
		win.on('updateGraphRoot.header', (e: any, data: any) => initRootId(data.id));
	};

	const onSearch = () => {
		const rootId = rootIdRef.current;

		menuOpen('searchObject', '#button-header-search', {
			horizontal: I.MenuDirection.Right,
			data: {
				rootId,
				blockId: rootId,
				blockIds: [ rootId ],
				filters: U.Data.getGraphFilters(),
				filter: S.Common.getGraph(key).filter,
				canAdd: true,
				withPlural: true,
				onSelect: (item: any) => {
					$(window).trigger('updateGraphRoot', { id: item.id });
				},
				onFilterChange: (v: string) => {
					S.Common.graphSet(key, { filter: v });
				},
			}
		});
	};

	const onFilter = () => {
	};

	const onSettings = () => {
		menuOpen('graphSettings', '#button-header-settings', {
			horizontal: I.MenuDirection.Right,
			subIds: J.Menu.graphSettings,
			data: {
				allowLocal: true,
				storageKey: key,
			}
		});
	};

	const onToggleEnhanced = () => {
		const settings = S.Common.getGraph(key);

		S.Common.graphSet(key, { enhanced: !settings.enhanced });
		$(window).trigger(`updateGraphView.${key}`);
	};

	const initRootId = (id: string) => {
		rootIdRef.current = id;
	};

	useEffect(() => {
		initRootId(rootId);
		rebind();

		return () => unbind();
	}, []);

	const isEnhanced = S.Common.getGraph(key).enhanced;

	return (
		<>
			<div className="side left">{renderLeftIcons(true, false)}</div>
			<div className="side center">{renderTabs()}</div>

			<div className="side right">
				<Icon
					id="button-header-enhanced"
					className={[ 'btn-enhanced', 'withBackground', (isEnhanced ? 'active' : '') ].join(' ')}
					tooltipParam={{
						text: isEnhanced ? translate('graphEnhancedSwitchToStandard') : translate('graphEnhancedSwitchToEnhanced'),
						typeY: I.MenuDirection.Bottom,
					}}
					onClick={onToggleEnhanced}
				/>

				<Icon
					id="button-header-search"
					className="btn-search withBackground"
					tooltipParam={{ text: translate('headerGraphTooltipSearch'), typeY: I.MenuDirection.Bottom }}
					onClick={onSearch}
				/>

				<Icon
					id="button-header-filter"
					className="btn-filter withBackground dn"
					tooltipParam={{ text: translate('headerGraphTooltipFilters'), typeY: I.MenuDirection.Bottom }}
					onClick={onFilter}
				/>

				<Icon
					id="button-header-settings"
					className="btn-settings withBackground"
					tooltipParam={{ text: translate('headerGraphTooltipSettings'), typeY: I.MenuDirection.Bottom }}
					onClick={onSettings}
				/>
			</div>
		</>
	);

});

export default HeaderMainGraph;
