/* Pre-computed PBKDF2 credentials for the seeded demo dataset.
 * Every seeded account uses the password: Bronee@2026
 * Hashed offline so the app boots instantly; the production Worker hashes
 * user-supplied passwords with the same algorithm (shared/crypto.ts).
 */
export const SEED_CREDENTIALS: { employeeId: string; email: string; passwordHash: string }[] = [
  { employeeId: 'emp-hr-admin', email: 'hr@bronneltd.com', passwordHash: 'pbkdf2$100000$F40EGnv16svkf7JpUQp+9g==$rHstof9N4aRITv3MpLdxANuprIwmRNE+I8tFTcNPmZQ=' },
  { employeeId: 'emp-farhana', email: 'farhana.bronee@gmail.com', passwordHash: 'pbkdf2$100000$dkVD2Ujbm25egRPAJO1d3w==$b4u1j203f+P+02Cb9rvh5TscwHI0hFkcy20Lpcoz8fM=' },
  { employeeId: 'emp-nusrat', email: 'nusrat.bronee@gmail.com', passwordHash: 'pbkdf2$100000$mR3avf9L107fx7R80mpTQg==$ZCF4IHZyWynVHBA6uezP7uwtQiV470yBUybKx30f4EA=' },
  { employeeId: 'emp-ismail', email: 'ismailhossainm712@gmail.com', passwordHash: 'pbkdf2$100000$3vAEmKXz930CsLuPwlKzjQ==$GFrIZ1viTlK9InXbuJCc/ieD2rY+au8fkBqBoSHw2uE=' },
  { employeeId: 'emp-mayin', email: 'chinexbd3@gmail.com', passwordHash: 'pbkdf2$100000$JyZ4bgSZcMjwSDTLO8H5aA==$BB3b3oUzu3enAztnqBuM4q9rXS5xBVqcrlF478Pfgbc=' },
  { employeeId: 'emp-sabbir', email: 'bronneltd@gmail.com', passwordHash: 'pbkdf2$100000$rWZyhbPKS8Ec3BaNESkYaQ==$77HASKg84CRuCqz4AX9hUF4Mbk0W4b1oG/mXJySTPrk=' },
  { employeeId: 'emp-sanjida', email: 'sanjidaaktersampa005@gmail.com', passwordHash: 'pbkdf2$100000$BNI6+mGAioGdNN+SMTQf6Q==$Gr9B0w0OwXwQMy0p+ohU/mlrC1U/7bXBIiY2hRwtY+U=' },
  { employeeId: 'emp-ashif', email: 'alashif.official@gmail.com', passwordHash: 'pbkdf2$100000$755I3eQTm00Jy49sJIT+Gg==$Uo/EE9nNgm5iUHdVJEpl2lHPEQjJMa6AiJP+5PuDAhc=' },
  { employeeId: 'emp-rabbi', email: 'rabbihossain255@gmail.com', passwordHash: 'pbkdf2$100000$5egLwbDDI1Byca5HvHHobg==$YM+tcZ/KBFI6KnAAet1aDPi1mw1vX02ilnnCvBoXEL0=' },
  { employeeId: 'emp-mohiuddin', email: 'mohiuddin.bronee@gmail.com', passwordHash: 'pbkdf2$100000$NM35/Z8vr3SnGuLmv5xMvQ==$3Qgd5dwwPCQRFndhsKAo6eiNiWWLNbdSf0Bgp942tQo=' },
  { employeeId: 'emp-abir', email: 'abir.bronee@gmail.com', passwordHash: 'pbkdf2$100000$xz3b7C8VUZ44rCirFS5iEg==$V9vv0bB3hegvOMbPc7/FKNGTp5GUkAR7LCyOorKtJr0=' },
  { employeeId: 'emp-shohid', email: 'shohid.bronee@gmail.com', passwordHash: 'pbkdf2$100000$Yz7LKQ4TED7O9JnVZFkS4w==$9tVCTw+mxV4MKcOh9E1xxGU9aR5j7ZTkhwaLzybU4/M=' },
  { employeeId: 'emp-abduljalil', email: 'abduljalil.bronee@gmail.com', passwordHash: 'pbkdf2$100000$hQQhYnW9mdfLX9e3Bw2hDQ==$rAqKFw8bPAywONnm4a7xtTce9r8hu8YGo6dsZXasoFw=' },
  { employeeId: 'emp-sabbir-ahamed', email: 'sezan5800@gmail.com', passwordHash: 'pbkdf2$100000$bsTCjnW4V6ER9MPuN7S2ig==$3BkMVDpvkO0sYG3vVQm+7x8GhvPlNrYpaq3wNgx6tSk=' },
  { employeeId: 'emp-tania', email: 'tania.bronee@gmail.com', passwordHash: 'pbkdf2$100000$Gj9gx9r1ksIxkebECl1Baw==$pYk5t3ovFGssjAfEybJIZTlRk29cMgRrd0j5NhlzMJ8=' },
  { employeeId: 'emp-rafiq', email: 'rafiq.bronee@gmail.com', passwordHash: 'pbkdf2$100000$dhRDYMqc8Vu3QuO4EznT2Q==$3rWxwRC0f68QJN9dh6AcbIGywY1joNORNKNkZJXjm0I=' },
];
