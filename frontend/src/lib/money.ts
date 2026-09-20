export function croreToUnits(cr:number):number {
 if(!Number.isFinite(cr)||cr<0||!Number.isSafeInteger(cr*2)) throw new Error('Use a nonnegative amount in steps of ₹0.5 Cr.');
 return cr*2;
}
export function unitsToCrore(units:number):number {
 if(!Number.isSafeInteger(units)||units<0) throw new Error('Invalid money units.');
 return units/2;
}
export const formatCrore=(units:number)=>'₹'+unitsToCrore(units).toLocaleString('en-IN',{maximumFractionDigits:1})+' Cr';
