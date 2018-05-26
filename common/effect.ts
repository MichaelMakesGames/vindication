export interface Effect {
	id: string;
	label: string;
	visibleTo: {
		rebel: boolean;
		authority: boolean;
	};
}

export default Effect;
