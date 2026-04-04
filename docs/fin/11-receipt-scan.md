# Receipt scanning

## What it does

**Receipt scan** uses AI vision to read a receipt photo and propose line items for your **Cargo** pantry. You review and confirm before items are saved.

## Credits

A receipt scan costs **2 AI credits** per successful run (organization balance). See *AI credits explained* for how balances work.

## Why it can show “processing”

Scanning is **asynchronous**: the image is queued, analyzed, and matched to your pantry naming. The UI **polls status** until the job completes or fails. This avoids timeouts and keeps the app responsive.

## Failures and refunds

If the operation fails after credits were reserved, Ration’s ledger is designed to **refund** the charge—see *Reliability and async jobs* for the general pattern. If your balance looks wrong after a failed scan, refresh the hub or open **Pricing / credits** and contact support if it persists.

## Tips

- Use good lighting and a full receipt in frame.
- If recognition is wrong, edit quantities or merge with existing Cargo after ingest.

If credit amounts change in the app or pricing page, **those values override** this article.
