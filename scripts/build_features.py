import os
import pandas as pd
import numpy as np

TRANSACTIONS_CSV = os.path.join("data", "seed", "transactions.csv")
ACCOUNTS_CSV = os.path.join("data", "seed", "accounts.csv")
OUTPUT_FEATURES_CSV = os.path.join("data", "seed", "transactions_features.csv")

def compute_features():
    print(f"Loading seed data from {TRANSACTIONS_CSV} and {ACCOUNTS_CSV}...")
    df = pd.read_csv(TRANSACTIONS_CSV)
    acc_df = pd.read_csv(ACCOUNTS_CSV)

    # Ensure timestamp is datetime and sort chronologically
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    df = df.sort_values('timestamp').reset_index(drop=True)

    # 1. hour_of_day
    df['hour_of_day'] = df['timestamp'].dt.hour

    # 2. is_new_counterparty: 1 if this is the first transaction between these two accounts
    print("Computing is_new_counterparty...")
    seen_counterparties = set()
    is_new = []
    for from_acc, to_acc in zip(df['from_account_id'], df['to_account_id']):
        pair = (from_acc, to_acc)
        if pair in seen_counterparties:
            is_new.append(0)
        else:
            is_new.append(1)
            seen_counterparties.add(pair)
    df['is_new_counterparty'] = is_new

    # 3. velocity: number of transactions from this account in the last 24 hours
    print("Computing 24-hour velocity per sending account...")
    # Calculate rolling 24h count per sender
    # Using groupby and rolling on datetime index
    df_indexed = df.set_index('timestamp')
    velocities = []
    
    # Fast calculation: maintain timestamps per account
    from collections import defaultdict, deque
    acc_history = defaultdict(deque)
    one_day = pd.Timedelta(hours=24)

    for idx, row in df.iterrows():
        t = row['timestamp']
        from_acc = row['from_account_id']
        dq = acc_history[from_acc]
        # Evict timestamps older than 24h
        cutoff = t - one_day
        while dq and dq[0] < cutoff:
            dq.popleft()
        velocities.append(len(dq))
        dq.append(t)

    df['velocity'] = velocities

    # 4. amount_zscore: how unusual is this amount relative to the sending account's historical transactions
    print("Computing amount_zscore per sending account...")
    acc_stats = df.groupby('from_account_id')['amount_usd'].agg(['mean', 'std']).reset_index()
    acc_stats.columns = ['from_account_id', 'acc_mean', 'acc_std']
    
    global_std = df['amount_usd'].std()
    acc_stats['acc_std'] = acc_stats['acc_std'].fillna(global_std)
    # If std is 0 (all transactions same amount), fallback to global_std or min floor
    acc_stats['acc_std'] = acc_stats['acc_std'].apply(lambda x: x if x > 1.0 else global_std)

    df = df.merge(acc_stats, on='from_account_id', how='left')
    df['amount_zscore'] = ((df['amount_usd'] - df['acc_mean']) / df['acc_std']).round(4)

    # 5. amount_to_balance_ratio: transaction amount relative to estimated account balance
    print("Computing amount_to_balance_ratio...")
    balance_map = dict(zip(acc_df['account_id'], acc_df['running_balance_estimate']))
    
    ratios = []
    for from_acc, amt in zip(df['from_account_id'], df['amount_usd']):
        bal = balance_map.get(from_acc, 5000.0)
        # Ensure non-zero denominator
        effective_bal = max(bal, 100.0)
        ratios.append(round(amt / effective_bal, 4))
    df['amount_to_balance_ratio'] = ratios

    # Clean up intermediate merge columns
    df = df.drop(columns=['acc_mean', 'acc_std'])

    print(f"Features successfully generated! Preview:")
    features = ["amount_zscore", "velocity", "is_new_counterparty", "hour_of_day", "amount_to_balance_ratio"]
    print(df[features].describe())

    print(f"Saving to {OUTPUT_FEATURES_CSV}...")
    df.to_csv(OUTPUT_FEATURES_CSV, index=False)
    print("Saved successfully!")

if __name__ == "__main__":
    compute_features()
