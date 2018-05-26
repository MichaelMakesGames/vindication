export default interface Pop {
	loyalty: 'authority' | 'neutral' | 'rebel';
	loyaltyVisibleTo: {
		authority: boolean;
		rebel: boolean;
	};
}
