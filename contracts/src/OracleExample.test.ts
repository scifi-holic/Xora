import { OracleExample } from './OracleExample';
import {
  Field,
  Mina,
  PrivateKey,
  PublicKey,
  AccountUpdate,
  Signature,
} from 'o1js';

let proofsEnabled = false;

// The public key of our trusted data provider
const ORACLE_PUBLIC_KEY = 'B62qnf8HieWGTA9dwtfKCGzoafqe5CAK3YSagERf6yjqqgW8jLrb98F';

describe('OracleExample', () => {
  let deployerAccount: PublicKey,
    deployerKey: PrivateKey,
    senderAccount: PublicKey,
    senderKey: PrivateKey,
    zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkApp: OracleExample;

  beforeAll(async () => {
    if (proofsEnabled) await OracleExample.compile();
  });

  beforeEach(() => {
    const Local = Mina.LocalBlockchain({ proofsEnabled });
    Mina.setActiveInstance(Local);
    ({ privateKey: deployerKey, publicKey: deployerAccount } =
      Local.testAccounts[0]);
    ({ privateKey: senderKey, publicKey: senderAccount } =
      Local.testAccounts[1]);
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();
    zkApp = new OracleExample(zkAppAddress);
  });

  async function localDeploy() {
    const txn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkApp.deploy();
    });
    await txn.prove();
    // this tx needs .sign(), because `deploy()` adds an account update that requires signature authorization
    await txn.sign([deployerKey, zkAppPrivateKey]).send();
  }

  it('generates and deploys the `OracleExample` smart contract', async () => {
    await localDeploy();
    const oraclePublicKey = zkApp.oraclePublicKey.get();
    expect(oraclePublicKey).toEqual(PublicKey.fromBase58(ORACLE_PUBLIC_KEY));
  });

  it('throws an error if the credit score is above 700 and the provided signature is invalid', async () => {
    await localDeploy();

    const pricePrecision = Field(699959400);
    const priceTime = Field(1711792417500);
    const signature = Signature.fromBase58(
      '7mXPv97hRN7AiUxBjuHgeWjzoSgL3z61a5QZacVgd1PEGain6FmyxQ8pbAYd5oycwLcAbqJLdezY7PRAUVtokFaQP8AJDEGX'
    );

    expect(async () => {
      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.verify(pricePrecision, priceTime, signature)
      });
    }).rejects;
  });

  describe('actual API requests', () => {
    it('emits an `id` event containing the users id if their credit score is above 700 and the provided signature is valid', async () => {
      await localDeploy();

      const response = await fetch(
        'https://zk-zero-pulse-api.vercel.app/api/price-feed?symbol=ETHUSDT'
      );
      const data = await response.json();

      const pricePrecision = Field(data.data.pricePrecision);
      const priceTime = Field(data.data.priceTime);
      const signature = Signature.fromBase58(data.signature);

      const txn = await Mina.transaction(senderAccount, () => {
        zkApp.verify(pricePrecision, priceTime, signature);
      });
      await txn.prove();
      await txn.sign([senderKey]).send();

      const events = await zkApp.fetchEvents();
      const verifiedEventValue = events[0].event.data.toFields(null)[0];
      expect(verifiedEventValue).toEqual(pricePrecision);
    });

    it('throws an error if the credit score is below 700 even if the provided signature is valid', async () => {
      await localDeploy();

      const response = await fetch(
        'https://zk-zero-pulse-api.vercel.app/api/price-feed?symbol=BTCUSDT'
      );
      const data = await response.json();

      const pricePrecision = Field(data.data.pricePrecision);
      const priceTime = Field(data.data.priceTime);
      const signature = Signature.fromBase58(data.signature);

      expect(async () => {
        const txn = await Mina.transaction(senderAccount, () => {
          zkApp.verify(pricePrecision, priceTime, signature);
        });
      }).rejects;
    });
  });
});
