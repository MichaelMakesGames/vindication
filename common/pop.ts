export interface Pop {
	loyalty: 'authority' | 'neutral' | 'rebel';
	loyaltyVisibleTo: {
		authority: boolean;
		rebel: boolean;
	};
}

export default Pop;
