import React from 'react';

const intensityColors = {
  recovery: 'bg-green-100 text-green-800 border-green-300',
  easy_aerobic: 'bg-blue-100 text-blue-800 border-blue-300',
  tempo_threshold: 'bg-orange-100 text-orange-800 border-orange-300',
  hiit: 'bg-red-100 text-red-800 border-red-300',
  rest: 'bg-gray-100 text-gray-800 border-gray-300',
};

const locationIcons = {
  indoor: '🏠',
  outdoor: '🌳',
};

const WorkoutCard = ({ plan, planName, onSelect, isSelected }) => {
  const colorClass = intensityColors[plan.intensity] || 'bg-gray-100 text-gray-800 border-gray-300';
  
  return (
    <div
      className={`relative rounded-lg border-2 p-6 cursor-pointer transition-all hover:shadow-lg ${
        isSelected ? 'ring-4 ring-blue-400 shadow-lg' : 'hover:border-blue-300'
      } ${colorClass}`}
      onClick={() => onSelect(planName)}
    >
      {isSelected && (
        <div className="absolute top-3 right-3">
          <div className="bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center">
            ✓
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-bold capitalize">
          {planName.replace('plan_', 'Option ').toUpperCase()}
        </h3>
        <span className="text-2xl">{locationIcons[plan.location]}</span>
      </div>
      
      <div className="mb-4">
        <div className="text-sm font-semibold uppercase tracking-wide mb-1">
          {plan.intensity.replace('_', ' ')}
        </div>
        <div className="text-2xl font-bold">
          {plan.duration_min} minutes
        </div>
      </div>
      
      <div className="space-y-2 mb-4">
        <div className="text-sm">
          <span className="font-semibold">Type:</span> {plan.workout_type}
        </div>
        <div className="text-sm">
          <span className="font-semibold">Location:</span> {plan.location}
        </div>
        {plan.target_zones && plan.target_zones.length > 0 && (
          <div className="text-sm">
            <span className="font-semibold">Target Zones:</span> {plan.target_zones.join(', ')}
          </div>
        )}
      </div>
      
      <div className="border-t pt-3">
        <p className="text-sm leading-relaxed">{plan.instructions}</p>
      </div>
      
      {plan.reasoning && (
        <div className="mt-3 pt-3 border-t border-dashed">
          <p className="text-xs italic opacity-75">{plan.reasoning}</p>
        </div>
      )}
    </div>
  );
};

export default WorkoutCard;
