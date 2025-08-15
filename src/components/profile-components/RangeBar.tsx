export function RangeBar({ min, max, current }: { min: number, max: number, current: number }) {
	const currentPercent = ((current - min) / (max - min)) * 100

	return (
		<div className="w-full max-w-xs mt-2">
			<div className="flex justify-between text-xs text-white mb-1">
				<span>${min.toFixed(2)}</span>
				<span>${max.toFixed(2)}</span>
			</div>
			<div className="relative h-3 flex items-center">
				<div className="absolute left-0 right-0 h-1 bg-gray-300 rounded" />
				{/* Center vertical line */}
				<div
					className="absolute z-10"
					style={{
						left: '50%',
						top: '-4px',
						height: '20px',
						width: '3px',
						background: '#3fff3f',
						borderRadius: '2px',
						transform: 'translateX(-50%)',
					}}
				/>
				<div className="absolute h-1 bg-primary rounded left-0 right-0" />
				<div
					className="absolute top-0 w-1 h-3 bg-yellow-400 rounded"
					style={{ left: `calc(${currentPercent}% - 4px)` }}
				/>
			</div>
		</div>
	)
} 