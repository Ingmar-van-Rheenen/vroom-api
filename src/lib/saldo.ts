import type { Auto, Rit, Tankbeurt } from '../db/schema.js';

export interface UserSaldo {
  userId: string;
  geredenKm: number;
  verschuldigd: number;
  getanktTotaal: number;
  saldo: number;
}

export interface SaldoOverzicht {
  autoId: string;
  perUser: UserSaldo[];
  totaal: {
    geredenKm: number;
    verschuldigd: number;
    getanktTotaal: number;
    saldo: number;
  };
}

function rond(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Berekent het saldo per gebruiker voor een auto.
 *
 *   verschuldigd = som(km) / km_per_liter x prijs_per_liter
 *   getanktTotaal = som(tankbeurten.totaal)
 *   saldo = getanktTotaal - verschuldigd
 *
 * Positief saldo = die gebruiker heeft meer getankt dan gereden (tegoed).
 * Negatief saldo = die gebruiker is nog geld verschuldigd.
 */
export function berekenSaldo(
  auto: Pick<Auto, 'id' | 'kmPerLiter' | 'prijsPerLiter'>,
  ritten: Pick<Rit, 'userId' | 'km'>[],
  tankbeurten: Pick<Tankbeurt, 'userId' | 'totaal'>[],
): SaldoOverzicht {
  const kmPerUser = new Map<string, number>();
  for (const rit of ritten) {
    kmPerUser.set(rit.userId, (kmPerUser.get(rit.userId) ?? 0) + rit.km);
  }

  const tankPerUser = new Map<string, number>();
  for (const t of tankbeurten) {
    tankPerUser.set(t.userId, (tankPerUser.get(t.userId) ?? 0) + t.totaal);
  }

  const kostprijsPerKm = auto.kmPerLiter > 0 ? auto.prijsPerLiter / auto.kmPerLiter : 0;

  const userIds = new Set<string>([...kmPerUser.keys(), ...tankPerUser.keys()]);
  const perUser: UserSaldo[] = [];

  for (const userId of userIds) {
    const geredenKm = kmPerUser.get(userId) ?? 0;
    const getanktTotaal = tankPerUser.get(userId) ?? 0;
    const verschuldigd = geredenKm * kostprijsPerKm;
    perUser.push({
      userId,
      geredenKm: rond(geredenKm),
      verschuldigd: rond(verschuldigd),
      getanktTotaal: rond(getanktTotaal),
      saldo: rond(getanktTotaal - verschuldigd),
    });
  }

  perUser.sort((a, b) => a.userId.localeCompare(b.userId));

  const totaal = perUser.reduce(
    (acc, u) => ({
      geredenKm: acc.geredenKm + u.geredenKm,
      verschuldigd: acc.verschuldigd + u.verschuldigd,
      getanktTotaal: acc.getanktTotaal + u.getanktTotaal,
      saldo: acc.saldo + u.saldo,
    }),
    { geredenKm: 0, verschuldigd: 0, getanktTotaal: 0, saldo: 0 },
  );

  return {
    autoId: auto.id,
    perUser,
    totaal: {
      geredenKm: rond(totaal.geredenKm),
      verschuldigd: rond(totaal.verschuldigd),
      getanktTotaal: rond(totaal.getanktTotaal),
      saldo: rond(totaal.saldo),
    },
  };
}
