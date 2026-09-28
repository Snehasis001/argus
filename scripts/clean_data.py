import os
import random
import numpy as np
import pandas as pd

# Set random seed for exact reproducibility
np.random.seed(42)
random.seed(42)

RAW_CSV_PATH = os.path.join("data", "raw", "HI-Small_Trans.csv")
SEED_DIR = os.path.join("data", "seed")
os.makedirs(SEED_DIR, exist_ok=True)

OUTPUT_TRANSACTIONS_CSV = os.path.join(SEED_DIR, "transactions.csv")
OUTPUT_ACCOUNTS_CSV = os.path.join(SEED_DIR, "accounts.csv")

# 1. Fixed static FX conversion rates to USD
STATIC_FX_TO_USD = {
    'US Dollar': 1.00,
    'Euro': 1.08,
    'UK Pound': 1.25,
    'Swiss Franc': 1.10,
    'Canadian Dollar': 0.74,
    'Australian Dollar': 0.65,
    'Yen': 0.0067,
    'Yuan': 0.14,
    'Rupee': 0.012,
    'Shekel': 0.27,
    'Brazil Real': 0.20,
    'Mexican Peso': 0.059,
    'Saudi Riyal': 0.27,
    'Ruble': 0.011,
    'Bitcoin': 20000.00
}

# 2. Narration text templates
# Legitimate transactions: specific, formal, transparent business and personal payment reasons
LEGIT_TEMPLATES = [
    "Salary payment - {month}",
    "Invoice #{inv_num} payment",
    "Rent transfer - {month}",
    "Utility bill payment",
    "Vendor settlement: {vendor}",
    "Client payment for services rendered",
    "Monthly payroll distribution",
    "Office supplies reimbursement",
    "Cloud infrastructure hosting fee",
    "Software subscription license renewal",
    "Health insurance group premium",
    "Quarterly corporate tax remittance",
    "Commercial equipment lease payment",
    "Groceries and household essentials",
    "School tuition installment",
    "Quarterly dividend distribution",
    "Logistics and shipping charges",
    "Legal and compliance advisory fee",
    "Marketing campaign retainer - {month}",
    "Hardware procurement - order #{inv_num}"
]

# Laundering-labeled transactions: deliberately vaguer, evasive, informal or opaque notes
LAUNDERING_TEMPLATES = [
    "Payment as discussed",
    "Consulting fee",
    "Gift transfer",
    "Misc",
    "Urgent settlement",
    "Personal loan return",
    "Settlement per agreement",
    "Services",
    "Funds transfer",
    "Private agreement fee",
    "Discretionary payout",
    "Advance payment",
    "Project expense reimbursement",
    "Advisory settlement",
    "Transfer",
    "Special consulting retainer",
    "Balance reconciliation",
    "Intermediary fee",
    "Per mutual understanding",
    "Direct disbursement"
]

MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
VENDORS = ["Apex Logistics", "Omega Tech", "Vertex Supplies", "Global Fleet", "Summit Media", "Delta Services", "BlueSky Corp"]

def generate_narration(is_laundering):
    if is_laundering == 1:
        template = random.choice(LAUNDERING_TEMPLATES)
        return template
    else:
        template = random.choice(LEGIT_TEMPLATES)
        month = random.choice(MONTHS)
        inv_num = random.randint(1000, 9999)
        vendor = random.choice(VENDORS)
        return template.format(month=month, inv_num=inv_num, vendor=vendor)

def clean_data():
    print(f"Reading raw data from {RAW_CSV_PATH} in chunks...")
    
    # Target bank: Bank 119 provides a rich graph of ~3,790 accounts, ~29,890 transactions,
    # and 129 ground-truth illicit laundering transactions.
    TARGET_BANK = 119
    
    chunks = []
    chunksize = 500000
    
    for chunk in pd.read_csv(RAW_CSV_PATH, chunksize=chunksize):
        # Filter down to transactions where From Bank == TARGET_BANK or To Bank == TARGET_BANK
        mask = (chunk['From Bank'] == TARGET_BANK) | (chunk['To Bank'] == TARGET_BANK)
        if mask.any():
            chunks.append(chunk[mask])
            
    df = pd.concat(chunks, ignore_index=True)
    print(f"Initial filtered rows (Bank {TARGET_BANK}): {len(df):,}")
    
    # Step 1: Drop exact duplicates
    initial_len = len(df)
    df = df.drop_duplicates()
    print(f"Dropped {initial_len - len(df)} exact duplicate rows. Remaining: {len(df):,}")
    
    # Step 2: Parse timestamp into a real datetime column and sort chronologically
    df['Timestamp'] = pd.to_datetime(df['Timestamp'], format='%Y/%m/%d %H:%M')
    df = df.sort_values('Timestamp').reset_index(drop=True)
    
    # Step 3: Create unique account IDs for graph representation (Bank_Account)
    df['from_account_id'] = df['From Bank'].astype(str) + "_" + df['Account'].astype(str)
    df['to_account_id'] = df['To Bank'].astype(str) + "_" + df['Account.1'].astype(str)
    
    # Step 4: Currency conversion to USD using fixed static table
    df['amount_paid_usd'] = df.apply(
        lambda r: round(r['Amount Paid'] * STATIC_FX_TO_USD.get(r['Payment Currency'], 1.0), 2), axis=1
    )
    df['amount_received_usd'] = df.apply(
        lambda r: round(r['Amount Received'] * STATIC_FX_TO_USD.get(r['Receiving Currency'], 1.0), 2), axis=1
    )
    # Primary transaction amount in USD
    df['amount_usd'] = df['amount_paid_usd']
    
    # Step 5: Synthesize narration text gap
    print("Synthesizing narration text with template pools...")
    df['narration'] = [generate_narration(val) for val in df['Is Laundering']]
    
    # Generate clean transaction ID
    df['transaction_id'] = [f"TX_{i+1:06d}" for i in range(len(df))]
    
    # Select and rename columns for the final transactions table
    transactions_df = df[[
        'transaction_id',
        'Timestamp',
        'from_account_id',
        'to_account_id',
        'From Bank',
        'To Bank',
        'Amount Paid',
        'Payment Currency',
        'Amount Received',
        'Receiving Currency',
        'amount_usd',
        'Payment Format',
        'Is Laundering',
        'narration'
    ]].rename(columns={
        'Timestamp': 'timestamp',
        'From Bank': 'from_bank',
        'To Bank': 'to_bank',
        'Amount Paid': 'amount_paid_orig',
        'Payment Currency': 'payment_currency',
        'Amount Received': 'amount_received_orig',
        'Receiving Currency': 'receiving_currency',
        'Payment Format': 'payment_format',
        'Is Laundering': 'is_laundering'
    })
    
    print(f"Saving cleaned transactions to {OUTPUT_TRANSACTIONS_CSV}...")
    transactions_df.to_csv(OUTPUT_TRANSACTIONS_CSV, index=False)
    print(f"Transactions saved! Total: {len(transactions_df):,}, Illicit: {transactions_df['is_laundering'].sum():,}")
    
    # Step 6: Build separate accounts.csv
    print("Building accounts.csv with running balances and first-seen dates...")
    
    # Collect all unique accounts
    from_accs = transactions_df[['from_account_id', 'from_bank', 'timestamp', 'amount_usd', 'is_laundering']].copy()
    from_accs.columns = ['account_id', 'bank_id', 'timestamp', 'amount_usd', 'is_laundering']
    from_accs['direction'] = 'sent'
    
    to_accs = transactions_df[['to_account_id', 'to_bank', 'timestamp', 'amount_usd', 'is_laundering']].copy()
    to_accs.columns = ['account_id', 'bank_id', 'timestamp', 'amount_usd', 'is_laundering']
    to_accs['direction'] = 'received'
    
    combined = pd.concat([from_accs, to_accs], ignore_index=True)
    
    # Aggregate account metrics
    account_groups = combined.groupby('account_id')
    
    acc_stats = []
    
    # Calculate baseline time reference (e.g. latest timestamp in dataset)
    reference_end_time = transactions_df['timestamp'].max()
    
    for acc_id, group in account_groups:
        bank_id = group['bank_id'].iloc[0]
        first_seen = group['timestamp'].min()
        last_seen = group['timestamp'].max()
        
        sent_rows = group[group['direction'] == 'sent']
        recv_rows = group[group['direction'] == 'received']
        
        total_sent = round(sent_rows['amount_usd'].sum(), 2)
        total_recv = round(recv_rows['amount_usd'].sum(), 2)
        sent_count = len(sent_rows)
        recv_count = len(recv_rows)
        
        # Account age relative to the observation period in days
        account_age_days = max(1, round((reference_end_time - first_seen).total_seconds() / 86400, 2))
        
        # Net transaction flow
        net_flow = total_recv - total_sent
        
        # Estimated running balance: Assign a realistic starting capital baseline so accounts remain solvent
        # Baseline = max(1000, 1.2 * total_sent) + net_flow
        baseline_capital = max(1000.0, round(total_sent * 1.2, 2))
        running_balance = round(baseline_capital + net_flow, 2)
        
        is_illicit_touch = int((group['is_laundering'] == 1).any())
        
        acc_stats.append({
            'account_id': acc_id,
            'bank_id': bank_id,
            'first_seen': first_seen,
            'last_seen': last_seen,
            'account_age_days': account_age_days,
            'running_balance_estimate': running_balance,
            'total_sent_usd': total_sent,
            'total_received_usd': total_recv,
            'sent_tx_count': sent_count,
            'received_tx_count': recv_count,
            'total_tx_count': sent_count + recv_count,
            'is_laundering_involved': is_illicit_touch
        })
        
    accounts_df = pd.DataFrame(acc_stats)
    accounts_df = accounts_df.sort_values('total_tx_count', ascending=False).reset_index(drop=True)
    
    print(f"Saving accounts data to {OUTPUT_ACCOUNTS_CSV}...")
    accounts_df.to_csv(OUTPUT_ACCOUNTS_CSV, index=False)
    print(f"Accounts saved! Total unique accounts: {len(accounts_df):,}, Illicitly involved: {accounts_df['is_laundering_involved'].sum():,}")
    
    print("\nSummary of Generated Artifacts:")
    print(f"- {OUTPUT_TRANSACTIONS_CSV} ({len(transactions_df):,} rows)")
    print(f"- {OUTPUT_ACCOUNTS_CSV} ({len(accounts_df):,} rows)")

if __name__ == "__main__":
    clean_data()
