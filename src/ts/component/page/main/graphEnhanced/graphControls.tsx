import React, { useState, useCallback } from 'react';
import { observer } from 'mobx-react';
import { Icon, Label } from 'Component';
import { I, S, U, translate } from 'Lib';

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

interface Props {
	types: TypeOption[];
	filter: FilterState;
	onFilterChange: (filter: FilterState) => void;
};

const DATE_OPTIONS = [
	{ value: 7, label: 'graphEnhancedDate7d' },
	{ value: 30, label: 'graphEnhancedDate30d' },
	{ value: 90, label: 'graphEnhancedDate90d' },
	{ value: 0, label: 'graphEnhancedDateAll' },
];

const GraphControls = observer(({ types, filter, onFilterChange }: Props) => {

	const [ isOpen, setIsOpen ] = useState(true);

	const onTypeToggle = useCallback((typeId: string) => {
		const next = new Set(filter.types);

		if (next.has(typeId)) {
			next.delete(typeId);
		} else {
			next.add(typeId);
		};

		onFilterChange({ ...filter, types: next });
	}, [ filter, onFilterChange ]);

	const onDateChange = useCallback((value: number) => {
		onFilterChange({ ...filter, dateRange: value });
	}, [ filter, onFilterChange ]);

	const onIsolateToggle = useCallback(() => {
		onFilterChange({ ...filter, isolate: !filter.isolate });
	}, [ filter, onFilterChange ]);

	const onSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		onFilterChange({ ...filter, search: e.target.value });
	}, [ filter, onFilterChange ]);

	const onToggle = useCallback(() => {
		setIsOpen(!isOpen);
	}, [ isOpen ]);

	return (
		<div className={[ 'graphControls', (isOpen ? 'isOpen' : '') ].join(' ')}>
			<div className="controlsHead" onClick={onToggle}>
				<Label text={translate('graphEnhancedFilters')} />
				<Icon className={[ 'collapse', (isOpen ? 'isOpen' : '') ].join(' ')} />
			</div>

			{isOpen ? (
				<div className="controlsBody">
					<div className="controlsSection">
						<input
							type="text"
							className="controlsSearch"
							placeholder={translate('graphEnhancedSearchPlaceholder')}
							value={filter.search}
							onChange={onSearchChange}
							aria-label={translate('graphEnhancedSearchPlaceholder')}
						/>
					</div>

					<div className="controlsSection">
						<Label className="sectionTitle" text={translate('graphEnhancedFilterByType')} />
						<div className="typeList">
							{types.map(t => {
								const isActive = filter.types.has(t.id);
								const cn = [ 'typeItem', (isActive ? 'isActive' : '') ];

								return (
									<div
										key={t.id}
										className={cn.join(' ')}
										onClick={() => onTypeToggle(t.id)}
										aria-label={t.name}
										role="checkbox"
										aria-checked={isActive}
									>
										<div
											className="typeColor"
											style={{ background: U.Common.iconBgByOption(t.iconOption) }}
										/>
										<div className="typeName">{t.name}</div>
										<div className="typeCount">{t.count}</div>
									</div>
								);
							})}
						</div>
					</div>

					<div className="controlsSection">
						<Label className="sectionTitle" text={translate('graphEnhancedFilterByDate')} />
						<div className="dateOptions">
							{DATE_OPTIONS.map(opt => {
								const isActive = (filter.dateRange === opt.value);

								return (
									<div
										key={opt.value}
										className={[ 'dateOption', (isActive ? 'isActive' : '') ].join(' ')}
										onClick={() => onDateChange(opt.value)}
										role="radio"
										aria-checked={isActive}
									>
										{translate(opt.label)}
									</div>
								);
							})}
						</div>
					</div>

					<div className="controlsSection">
						<div
							className={[ 'isolateToggle', (filter.isolate ? 'isActive' : '') ].join(' ')}
							onClick={onIsolateToggle}
							role="checkbox"
							aria-checked={filter.isolate}
							aria-label={translate('graphEnhancedIsolate')}
						>
							<div className="toggleSwitch">
								<div className="toggleKnob" />
							</div>
							<Label text={translate('graphEnhancedIsolate')} />
						</div>
					</div>
				</div>
			) : ''}
		</div>
	);

});

export default GraphControls;
