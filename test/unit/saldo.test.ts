import { describe, expect, it } from 'vitest';
import { berekenSaldo } from '../../src/lib/saldo.js';

const auto = { id: 'auto-1', kmPerLiter: 10, prijsPerLiter: 2 }; // kostprijs = 0,20/km

describe('berekenSaldo', () => {
  it('rekent verschuldigd en tegoed per gebruiker uit', () => {
    const res = berekenSaldo(
      auto,
      [
        { userId: 'u1', km: 100 },
        { userId: 'u2', km: 50 },
      ],
      [{ userId: 'u1', totaal: 30 }],
    );

    const u1 = res.perUser.find((u) => u.userId === 'u1')!;
    const u2 = res.perUser.find((u) => u.userId === 'u2')!;

    // u1: 100 km x 0,20 = 20 verschuldigd, 30 getankt -> saldo +10
    expect(u1.verschuldigd).toBe(20);
    expect(u1.getanktTotaal).toBe(30);
    expect(u1.saldo).toBe(10);

    // u2: 50 km x 0,20 = 10 verschuldigd, 0 getankt -> saldo -10
    expect(u2.verschuldigd).toBe(10);
    expect(u2.saldo).toBe(-10);

    expect(res.totaal.geredenKm).toBe(150);
    expect(res.totaal.saldo).toBe(0);
  });

  it('deelt niet door nul als km_per_liter 0 is', () => {
    const res = berekenSaldo(
      { id: 'a', kmPerLiter: 0, prijsPerLiter: 2 },
      [{ userId: 'u1', km: 100 }],
      [],
    );
    expect(res.perUser[0]!.verschuldigd).toBe(0);
  });

  it('geeft een lege uitkomst zonder ritten of tankbeurten', () => {
    const res = berekenSaldo(auto, [], []);
    expect(res.perUser).toHaveLength(0);
    expect(res.totaal.saldo).toBe(0);
  });

  it('telt meerdere ritten en tankbeurten van dezelfde gebruiker op', () => {
    const res = berekenSaldo(
      auto,
      [
        { userId: 'u1', km: 10 },
        { userId: 'u1', km: 15 },
      ],
      [
        { userId: 'u1', totaal: 5 },
        { userId: 'u1', totaal: 7.5 },
      ],
    );
    const u1 = res.perUser[0]!;
    expect(u1.geredenKm).toBe(25);
    expect(u1.getanktTotaal).toBe(12.5);
    expect(u1.verschuldigd).toBe(5); // 25 x 0,20
    expect(u1.saldo).toBe(7.5);
  });
});
